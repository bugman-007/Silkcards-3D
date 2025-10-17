"""
Report generation module for parser-service.
Builds report.json with proper schema and diagnostic information.
"""

import json
from typing import Dict, List, Optional, Any
from datetime import datetime
from pathlib import Path


class ReportBuilder:
    """Builder class for constructing parser job reports."""
    
    def __init__(self, job_id: str):
        self.job_id = job_id
        self.illustrator_info = {}
        self.artboards = []
        self.sides = []
        self.plates_detected = []
        self.outputs = {}
        self.diagnostics = []
        
    def set_illustrator_info(self, version: str, pdf_preset: str = "PDF/X-4", 
                            doc_color: str = "CMYK"):
        """Set Illustrator document information."""
        self.illustrator_info = {
            "version": version,
            "pdf_preset": pdf_preset,
            "doc_color": doc_color
        }
        return self
    
    def add_artboard(self, name: str, index: int, bounds: List[float]):
        """
        Add artboard information.
        
        Args:
            name: Artboard name
            index: Artboard index
            bounds: [x0, y0, x1, y1] in points
        """
        self.artboards.append({
            "name": name,
            "index": index,
            "bounds": bounds
        })
        return self
    
    def add_side(self, side: str, index: int, finishes: List[str], 
                 die: bool = False):
        """
        Add side information.
        
        Args:
            side: "front" or "back"
            index: Layer index (usually 0)
            finishes: List of finish types present (e.g., ["albedo", "foil", "uv"])
            die: Whether die/diecut is present
        """
        self.sides.append({
            "side": side,
            "index": index,
            "finishes": finishes,
            "die": die
        })
        return self
    
    def set_plates_detected(self, plates: List[str]):
        """
        Set list of detected plates from Ghostscript.
        
        Args:
            plates: List of plate names (e.g., ["Cyan", "Magenta", "UV", "FOIL"])
        """
        self.plates_detected = plates
        return self
    
    def add_output(self, key: str, filename: str):
        """
        Add output file mapping.
        
        Args:
            key: Output key (e.g., "front_layer_0_albedo")
            filename: Output filename (e.g., "front_layer_0_albedo.png")
        """
        self.outputs[key] = filename
        return self
    
    def add_diagnostic(self, level: str, code: str, detail: str):
        """
        Add diagnostic message.
        
        Args:
            level: "info", "warning", or "error"
            code: Error/diagnostic code (e.g., "MULTIFOIL_MERGED")
            detail: Human-readable detail message
        """
        self.diagnostics.append({
            "level": level,
            "code": code,
            "detail": detail
        })
        return self
    
    def add_info(self, code: str, detail: str):
        """Add info-level diagnostic."""
        return self.add_diagnostic("info", code, detail)
    
    def add_warning(self, code: str, detail: str):
        """Add warning-level diagnostic."""
        return self.add_diagnostic("warning", code, detail)
    
    def add_error(self, code: str, detail: str):
        """Add error-level diagnostic."""
        return self.add_diagnostic("error", code, detail)
    
    def build(self) -> Dict[str, Any]:
        """
        Build and return the report dictionary.
        
        Returns:
            Dict containing the complete report
        """
        return {
            "jobId": self.job_id,
            "illustrator": self.illustrator_info,
            "artboards": self.artboards,
            "sides": self.sides,
            "plates_detected": self.plates_detected,
            "outputs": self.outputs,
            "diagnostics": self.diagnostics
        }
    
    def to_json(self, indent: int = 2) -> str:
        """
        Build and return the report as JSON string.
        
        Args:
            indent: JSON indentation level
            
        Returns:
            JSON string
        """
        return json.dumps(self.build(), indent=indent)
    
    def save(self, output_path: Path):
        """
        Build and save the report to a file.
        
        Args:
            output_path: Path to output JSON file
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(self.to_json())


class ErrorReport:
    """Helper class for creating error reports when job fails."""
    
    @staticmethod
    def create(job_id: str, error_code: str, error_message: str, 
               error_detail: Optional[str] = None) -> Dict[str, Any]:
        """
        Create an error report.
        
        Args:
            job_id: Job identifier
            error_code: Error code from config.ERROR_CODES
            error_message: Main error message
            error_detail: Optional detailed error information
            
        Returns:
            Dict containing error report
        """
        report = {
            "jobId": job_id,
            "success": False,
            "error": {
                "code": error_code,
                "message": error_message,
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
        }
        
        if error_detail:
            report["error"]["detail"] = error_detail
        
        return report
    
    @staticmethod
    def save_error(job_id: str, error_code: str, error_message: str,
                   output_path: Path, error_detail: Optional[str] = None):
        """
        Create and save an error report to a file.
        
        Args:
            job_id: Job identifier
            error_code: Error code from config.ERROR_CODES
            error_message: Main error message
            output_path: Path to output JSON file
            error_detail: Optional detailed error information
        """
        report = ErrorReport.create(job_id, error_code, error_message, error_detail)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2)


def load_jsx_scratch_json(scratch_path: Path) -> Optional[Dict[str, Any]]:
    """
    Load the scratch JSON written by JSX during export.
    
    Args:
        scratch_path: Path to scratch JSON file
        
    Returns:
        Dict containing scratch data, or None if not found/invalid
    """
    if not scratch_path.exists():
        return None
    
    try:
        with open(scratch_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None


def merge_jsx_scratch_into_report(report_builder: ReportBuilder, 
                                   scratch_data: Dict[str, Any]) -> ReportBuilder:
    """
    Merge information from JSX scratch JSON into report builder.
    
    Args:
        report_builder: ReportBuilder instance
        scratch_data: Scratch data from JSX
        
    Returns:
        Updated ReportBuilder
    """
    # Add Illustrator info if present
    if "illustrator" in scratch_data:
        ill = scratch_data["illustrator"]
        report_builder.set_illustrator_info(
            version=ill.get("version", "unknown"),
            pdf_preset=ill.get("pdf_preset", "PDF/X-4"),
            doc_color=ill.get("doc_color", "CMYK")
        )
    
    # Add artboards if present
    if "artboards" in scratch_data:
        for ab in scratch_data["artboards"]:
            report_builder.add_artboard(
                name=ab.get("name", ""),
                index=ab.get("index", 0),
                bounds=ab.get("bounds", [0, 0, 0, 0])
            )
    
    # Add side detection info if present
    if "sides" in scratch_data:
        for side in scratch_data["sides"]:
            report_builder.add_side(
                side=side.get("side", ""),
                index=side.get("index", 0),
                finishes=side.get("finishes", []),
                die=side.get("die", False)
            )
    
    # Add warnings/diagnostics if present
    if "warnings" in scratch_data:
        for warn in scratch_data["warnings"]:
            report_builder.add_warning(
                code=warn.get("code", "UNKNOWN"),
                detail=warn.get("message", "")
            )
    
    if "errors" in scratch_data:
        for err in scratch_data["errors"]:
            report_builder.add_error(
                code=err.get("code", "UNKNOWN"),
                detail=err.get("message", "")
            )
    
    return report_builder


def validate_report(report: Dict[str, Any]) -> List[str]:
    """
    Validate report structure and return list of validation errors.
    
    Args:
        report: Report dictionary
        
    Returns:
        List of validation error messages (empty if valid)
    """
    errors = []
    
    # Check required top-level keys
    required_keys = ["jobId", "illustrator", "artboards", "sides", 
                     "plates_detected", "outputs", "diagnostics"]
    for key in required_keys:
        if key not in report:
            errors.append(f"Missing required key: {key}")
    
    # Check sides match outputs
    if "sides" in report and "outputs" in report:
        for side in report["sides"]:
            side_name = side.get("side", "")
            index = side.get("index", 0)
            finishes = side.get("finishes", [])
            
            for finish in finishes:
                if finish == "albedo":
                    continue  # Always required
                
                key = f"{side_name}_layer_{index}_{finish}"
                if key not in report["outputs"] and finish not in ["die"]:
                    errors.append(f"Side declares finish '{finish}' but no output: {key}")
    
    return errors

