"""
Main orchestrator for parser-service.
Coordinates Illustrator export, Ghostscript plate extraction, and report generation.
"""

import os
import sys
import uuid
import json
import shutil
import logging
import traceback
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent))

import config
import report
import illustrator
import gs_runner
import die_vector

# Setup logging
config.ensure_directories()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(config.LOG_FILE, encoding="utf-8"),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger("parser.app")


class ParserJob:
    """Encapsulates a single parser job."""
    
    def __init__(self, job_id: str, input_path: Path):
        """
        Initialize parser job.
        
        Args:
            job_id: Job identifier
            input_path: Path to input .ai file
        """
        self.job_id = job_id
        self.input_path = input_path
        
        # Job directories
        self.working_dir = config.JOBS_WORKING / job_id
        self.results_dir = config.JOBS_RESULTS / job_id
        self.failed_dir = config.JOBS_FAILED
        
        # Create directories
        self.working_dir.mkdir(parents=True, exist_ok=True)
        self.results_dir.mkdir(parents=True, exist_ok=True)
        
        # Report builder
        self.report_builder = report.ReportBuilder(job_id)
        
        logger.info(f"[{job_id}] Job initialized")
        logger.info(f"[{job_id}] Input: {input_path}")
        logger.info(f"[{job_id}] Working: {self.working_dir}")
        logger.info(f"[{job_id}] Results: {self.results_dir}")
    
    def run(self) -> Dict[str, Any]:
        """
        Run the complete parser job.
        
        Returns:
            Dict with job results
        """
        try:
            # Phase 1: Illustrator export
            logger.info(f"[{self.job_id}] Phase 1: Illustrator export")
            self._run_illustrator_phase()
            
            # Phase 2: Ghostscript plate extraction
            logger.info(f"[{self.job_id}] Phase 2: Ghostscript plate extraction")
            self._run_ghostscript_phase()
            
            # Phase 3: Optional die vector extraction
            logger.info(f"[{self.job_id}] Phase 3: Die vector extraction")
            self._run_die_vector_phase()
            
            # Phase 4: Assemble report
            logger.info(f"[{self.job_id}] Phase 4: Assembling report")
            self._assemble_report()
            
            # Success
            logger.info(f"[{self.job_id}] Job completed successfully")
            
            return {
                "success": True,
                "jobId": self.job_id,
                "results_dir": str(self.results_dir)
            }
        
        except Exception as e:
            logger.error(f"[{self.job_id}] Job failed: {e}")
            logger.error(traceback.format_exc())
            
            # Move to failed directory
            self._handle_failure(str(e))
            
            raise
    
    def _run_illustrator_phase(self):
        """Run Illustrator export phase."""
        try:
            # Run export job
            result = illustrator.run_export_job(
                self.job_id,
                self.input_path,
                self.working_dir
            )
            
            # Load scratch data
            scratch_data = result.get("scratch_data")
            if scratch_data:
                # Merge scratch data into report
                report.merge_jsx_scratch_into_report(self.report_builder, scratch_data)
                
                logger.info(f"[{self.job_id}] Loaded scratch data from JSX")
            else:
                logger.warning(f"[{self.job_id}] No scratch data from JSX")
            
            # Verify PDF was created
            pdf_path = self.working_dir / f"{self.job_id}.pdf"
            if not pdf_path.exists():
                raise RuntimeError("PDF/X file was not created")
            
            logger.info(f"[{self.job_id}] Illustrator phase completed")
        
        except illustrator.IllustratorTimeoutError:
            self._add_error("TIMEOUT_ILLUSTRATOR", "Illustrator operation timed out")
            raise
        except illustrator.IllustratorError as e:
            self._add_error("PDF_SAVE_FAILED", str(e))
            raise
    
    def _run_ghostscript_phase(self):
        """Run Ghostscript plate extraction phase (PER-SIDE)."""
        logger.info(f"[{self.job_id}] === Starting Ghostscript Phase (Per-Side) ===")
        
        # Get sides from scratch data
        scratch_path = self.working_dir / f"{self.job_id}_scratch.json"
        scratch_data = report.load_jsx_scratch_json(scratch_path)
        
        if not scratch_data or "sides" not in scratch_data:
            logger.warning(f"[{self.job_id}] No scratch data, falling back to default sides")
            sides_to_process = [{"side": "front", "index": 0, "finishes": []}, 
                               {"side": "back", "index": 0, "finishes": []}]
        else:
            sides_to_process = scratch_data["sides"]
        
        all_plates_detected = []
        
        try:
            # Process each side separately
            for side_info in sides_to_process:
                side = side_info["side"]  # "front" or "back"
                side_index = side_info.get("index", 0)
                finishes = side_info.get("finishes", [])
                
                logger.info(f"[{self.job_id}] --- Processing side: {side} ---")
                logger.info(f"[{self.job_id}] Expected finishes: {finishes}")
                
                # Find side PDF
                side_pdf = self.working_dir / f"{self.job_id}_{side}_layer_{side_index}.pdf"
                
                if not side_pdf.exists():
                    logger.warning(f"[{self.job_id}] Side PDF not found: {side_pdf}")
                    continue
                
                logger.info(f"[{self.job_id}] Side PDF exists: {side_pdf}")
                
                # Extract plates for THIS side
                result = gs_runner.extract_and_convert_plates(
                    side_pdf,
                    self.working_dir,
                    self.job_id,
                    self._build_expected_finishes_dict(finishes)
                )
                
                plates_detected = result.get("plates_detected", [])
                logger.info(f"[{self.job_id}] Plates detected for {side}: {plates_detected}")
                all_plates_detected.extend(plates_detected)
                
                # Move converted plates to results with side prefix
                converted = result.get("converted", {})
                self._move_side_plates_to_results(converted, side, side_index)
            
            # Update report with all plates
            self.report_builder.set_plates_detected(list(set(all_plates_detected)))
            
            # Add diagnostic about DPI
            self.report_builder.add_info("PLATE_DPI", str(config.PLATE_DPI))
            
            # Move albedo PNGs to results (already have side prefix from JSX)
            self._move_albedo_to_results()
            
            logger.info(f"[{self.job_id}] Ghostscript phase completed")
        
        except gs_runner.GhostscriptTimeoutError:
            self._add_error("TIMEOUT_GS", "Ghostscript operation timed out")
            raise
        except gs_runner.GhostscriptError as e:
            self._add_error("GHOSTSCRIPT_FAILED", str(e))
            raise
    
    def _run_die_vector_phase(self):
        """Run optional die vector extraction phase."""
        # Check if die SVG was already created by JSX
        jsx_die_svgs = list(self.working_dir.glob("*_diecut.svg"))
        
        if jsx_die_svgs:
            # JSX already created die SVG; move to results
            for svg_path in jsx_die_svgs:
                dest = self.results_dir / svg_path.name
                shutil.copy(svg_path, dest)
                logger.info(f"[{self.job_id}] Moved die SVG: {svg_path.name}")
            
            return
        
        # Otherwise, try pdfToolbox extraction (optional)
        pdf_path = self.working_dir / f"{self.job_id}.pdf"
        
        try:
            extractor = die_vector.DieVectorExtractor()
            
            if not extractor.is_available():
                logger.info(f"[{self.job_id}] Die vector extraction skipped (pdfToolbox not available)")
                return
            
            # Extract die for each side
            for side in ["front", "back"]:
                output_svg = self.results_dir / f"{side}_layer_0_diecut.svg"
                
                try:
                    success = die_vector.extract_die_vector(pdf_path, output_svg)
                    if success:
                        logger.info(f"[{self.job_id}] Extracted die vector: {output_svg.name}")
                except die_vector.DieVectorError as e:
                    logger.warning(f"[{self.job_id}] Could not extract die vector: {e}")
        
        except Exception as e:
            logger.warning(f"[{self.job_id}] Die vector phase failed (non-critical): {e}")
    
    def _assemble_report(self):
        """Assemble final report.json."""
        # Collect output files
        for result_file in self.results_dir.glob("*"):
            if result_file.is_file():
                # Parse filename to get output key
                # Example: front_layer_0_albedo.png → key: front_layer_0_albedo
                key = result_file.stem
                self.report_builder.add_output(key, result_file.name)
        
        # Save report
        report_path = self.results_dir / "report.json"
        self.report_builder.save(report_path)
        
        logger.info(f"[{self.job_id}] Report saved: {report_path}")
        
        # Validate report
        report_data = self.report_builder.build()
        validation_errors = report.validate_report(report_data)
        
        if validation_errors:
            logger.warning(f"[{self.job_id}] Report validation warnings: {validation_errors}")
    
    def _get_expected_finishes(self) -> Optional[Dict[str, bool]]:
        """
        Get expected finishes from scratch data.
        
        Returns:
            Dict of expected finishes or None
        """
        # Check if scratch JSON exists
        scratch_path = self.working_dir / f"{self.job_id}_scratch.json"
        scratch_data = report.load_jsx_scratch_json(scratch_path)
        
        if not scratch_data or "sides" not in scratch_data:
            return None
        
        expected = {
            "UV": False,
            "FOIL": False,
            "EMBOSS": False,
            "DIE": False
        }
        
        for side in scratch_data["sides"]:
            finishes = side.get("finishes", [])
            if "uv" in finishes:
                expected["UV"] = True
            if "foil" in finishes:
                expected["FOIL"] = True
            if "emboss" in finishes:
                expected["EMBOSS"] = True
            if "diecut_mask" in finishes or side.get("die", False):
                expected["DIE"] = True
        
        return expected
    
    def _build_expected_finishes_dict(self, finishes: List[str]) -> Optional[Dict[str, bool]]:
        """Build expected finishes dict from finish list."""
        if not finishes:
            return None
        
        return {
            "UV": "uv" in finishes or "spot_uv" in finishes,
            "FOIL": "foil" in finishes,
            "EMBOSS": "emboss" in finishes,
            "DIE": "diecut_mask" in finishes or "die" in finishes
        }
    
    def _move_side_plates_to_results(self, converted: Dict[str, Path], side: str, side_index: int):
        """
        Move converted plate PNGs to results directory with side prefix.
        
        Args:
            converted: Dict mapping finish type to temp PNG path
            side: Side name ("front" or "back")
            side_index: Side index (0, 1, etc.)
        """
        logger.info(f"[{self.job_id}] === Moving Plates for {side} ===")
        logger.info(f"[{self.job_id}] Converted plates: {converted}")
        logger.info(f"[{self.job_id}] Number of plates to move: {len(converted)}")
        
        if not converted:
            logger.warning(f"[{self.job_id}] No converted plates to move for {side}!")
            return
        
        for finish_type, temp_png in converted.items():
            logger.info(f"[{self.job_id}] Processing plate: {finish_type} from {temp_png}")
            
            if not temp_png.exists():
                logger.warning(f"[{self.job_id}] Temp PNG not found: {temp_png}")
                continue
            
            # Determine proper filename with side prefix
            filename = config.get_output_filename(side, side_index, finish_type)
            dest = self.results_dir / filename
            
            shutil.copy(temp_png, dest)
            logger.info(f"[{self.job_id}] ✓ Moved plate: {filename} to {dest}")
    
    def _move_albedo_to_results(self):
        """Move albedo PNGs from working to results."""
        logger.info(f"[{self.job_id}] === Moving Albedo PNGs to Results ===")
        
        albedo_pngs = list(self.working_dir.glob("*_albedo.png"))
        logger.info(f"[{self.job_id}] Found {len(albedo_pngs)} albedo PNG(s): {[p.name for p in albedo_pngs]}")
        
        if not albedo_pngs:
            logger.warning(f"[{self.job_id}] No albedo PNGs found in working directory!")
            return
        
        for albedo_png in albedo_pngs:
            dest = self.results_dir / albedo_png.name
            shutil.copy(albedo_png, dest)
            logger.info(f"[{self.job_id}] ✓ Moved albedo: {albedo_png.name} to {dest}")
    
    def _add_error(self, code: str, message: str):
        """Add error to report."""
        self.report_builder.add_error(code, message)
    
    def _handle_failure(self, error_message: str):
        """
        Handle job failure by moving to failed directory.
        
        Args:
            error_message: Error message
        """
        try:
            # Create failed job directory
            failed_job_dir = self.failed_dir / self.job_id
            failed_job_dir.mkdir(parents=True, exist_ok=True)
            
            # Copy input file
            if self.input_path.exists():
                shutil.copy(self.input_path, failed_job_dir / self.input_path.name)
            
            # Copy working directory contents
            if self.working_dir.exists():
                for item in self.working_dir.glob("*"):
                    if item.is_file():
                        shutil.copy(item, failed_job_dir / item.name)
            
            # Write error report
            error_report_path = failed_job_dir / "error.json"
            report.ErrorReport.save_error(
                self.job_id,
                "JOB_FAILED",
                error_message,
                error_report_path
            )
            
            logger.info(f"[{self.job_id}] Job moved to failed directory: {failed_job_dir}")
        
        except Exception as e:
            logger.error(f"[{self.job_id}] Could not handle failure: {e}")


def run_job(input_ai_path: str, job_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Run a parser job.
    
    Args:
        input_ai_path: Path to input .ai file
        job_id: Optional job ID (auto-generated if None)
        
    Returns:
        Dict with job results
    """
    if job_id is None:
        job_id = str(uuid.uuid4())
    
    input_path = Path(input_ai_path)
    
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_ai_path}")
    
    if not input_path.suffix.lower() == ".ai":
        raise ValueError(f"Input must be .ai file: {input_ai_path}")
    
    # Create and run job
    job = ParserJob(job_id, input_path)
    return job.run()


def run_health_check() -> bool:
    """
    Run health check on parser service.
    
    Returns:
        True if health check passes
    """
    logger.info("Running parser service health check...")
    
    try:
        # Check Illustrator
        illustrator.run_health_check()
        logger.info("✓ Illustrator OK")
        
        # Check Ghostscript
        try:
            gs_exe = config.get_ghostscript_path()
            logger.info(f"✓ Ghostscript OK: {gs_exe}")
        except FileNotFoundError as e:
            logger.error(f"✗ Ghostscript not found: {e}")
            return False
        
        # Check pdfToolbox (optional)
        pdftoolbox_exe = config.get_pdftoolbox_path()
        if pdftoolbox_exe:
            logger.info(f"✓ pdfToolbox OK: {pdftoolbox_exe}")
        else:
            logger.info("○ pdfToolbox not found (optional)")
        
        logger.info("Health check passed!")
        return True
    
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return False


def main():
    """CLI entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Parser Service - Convert .ai to masks and albedo")
    
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # Parse command
    parse_parser = subparsers.add_parser("parse", help="Parse an .ai file")
    parse_parser.add_argument("input", type=str, help="Path to input .ai file")
    parse_parser.add_argument("--job-id", type=str, help="Optional job ID")
    
    # Health check command
    subparsers.add_parser("health", help="Run health check")
    
    # API server command
    api_parser = subparsers.add_parser("api", help="Start API server")
    api_parser.add_argument("--host", default=config.API_HOST, help="API host")
    api_parser.add_argument("--port", type=int, default=config.API_PORT, help="API port")
    
    args = parser.parse_args()
    
    if args.command == "parse":
        try:
            result = run_job(args.input, args.job_id)
            print(json.dumps(result, indent=2))
            return 0
        except Exception as e:
            logger.error(f"Job failed: {e}")
            return 1
    
    elif args.command == "health":
        try:
            success = run_health_check()
            return 0 if success else 1
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return 1
    
    elif args.command == "api":
        # Import and run Flask API
        from .api_server import create_app
        app = create_app()
        app.run(host=args.host, port=args.port, threaded=True)
        return 0
    
    else:
        parser.print_help()
        return 1


if __name__ == "__main__":
    sys.exit(main())

