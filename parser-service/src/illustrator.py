"""
Illustrator runner module for parser-service.
Handles launching Illustrator with JSX scripts and managing timeouts.
"""

import os
import subprocess
import time
import logging
from pathlib import Path
from typing import Optional, Dict, Any

from . import config

logger = logging.getLogger("parser.illustrator")


class IllustratorError(Exception):
    """Base exception for Illustrator operations."""
    pass


class IllustratorTimeoutError(IllustratorError):
    """Raised when Illustrator operation times out."""
    pass


class IllustratorRunner:
    """Manages Illustrator process and JSX execution."""
    
    def __init__(self, illustrator_exe: Optional[str] = None):
        """
        Initialize Illustrator runner.
        
        Args:
            illustrator_exe: Path to Illustrator executable (uses config default if None)
        """
        self.illustrator_exe = illustrator_exe or config.ILLUSTRATOR_EXE
        
        if not os.path.exists(self.illustrator_exe):
            raise IllustratorError(
                f"Illustrator executable not found: {self.illustrator_exe}"
            )
    
    def kill_illustrator(self):
        """Kill any running Illustrator processes (best-effort)."""
        try:
            # Use PowerShell to kill Illustrator processes
            cmd = (
                'powershell -NoProfile -Command '
                '"Get-Process -Name Illustrator -ErrorAction SilentlyContinue | '
                'Stop-Process -Force"'
            )
            subprocess.run(cmd, shell=True, timeout=10, capture_output=True)
            logger.info("Killed existing Illustrator processes")
            time.sleep(2)  # Give time for cleanup
        except Exception as e:
            logger.warning(f"Could not kill Illustrator: {e}")
    
    def run_jsx(self, jsx_path: Path, timeout: int = None) -> bool:
        """
        Run a JSX script in Illustrator.
        
        Args:
            jsx_path: Path to JSX script
            timeout: Timeout in seconds (uses config default if None)
            
        Returns:
            True if script executed successfully
            
        Raises:
            IllustratorError: If script execution fails
            IllustratorTimeoutError: If execution times out
        """
        if timeout is None:
            timeout = config.ILLUSTRATOR_TIMEOUT
        
        if not jsx_path.exists():
            raise IllustratorError(f"JSX script not found: {jsx_path}")
        
        logger.info(f"Running JSX: {jsx_path}")
        logger.info(f"Timeout: {timeout}s")
        
        try:
            # Launch Illustrator with JSX script
            # Illustrator.exe accepts a JSX file as argument
            proc = subprocess.Popen(
                [self.illustrator_exe, str(jsx_path)],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                shell=False
            )
            
            logger.info(f"Illustrator started (PID: {proc.pid})")
            
            # Wait for completion with timeout
            try:
                stdout, stderr = proc.communicate(timeout=timeout)
                
                # Log output
                if stdout:
                    logger.debug(f"stdout: {stdout.decode('utf-8', errors='ignore')}")
                if stderr:
                    logger.debug(f"stderr: {stderr.decode('utf-8', errors='ignore')}")
                
                # Note: Illustrator return code is not reliable for GUI apps
                # We rely on sentinel files written by JSX
                logger.info(f"Illustrator process completed (return code: {proc.returncode})")
                return True
                
            except subprocess.TimeoutExpired:
                logger.error(f"Illustrator timed out after {timeout}s")
                proc.kill()
                proc.wait()
                raise IllustratorTimeoutError(f"Illustrator timed out after {timeout}s")
        
        except FileNotFoundError:
            raise IllustratorError(f"Illustrator executable not found: {self.illustrator_exe}")
        except Exception as e:
            logger.error(f"Error running Illustrator: {e}")
            raise IllustratorError(f"Failed to run Illustrator: {e}")
    
    def run_job(self, job_id: str, input_path: Path, output_dir: Path, 
                timeout: int = None) -> Dict[str, Any]:
        """
        Run a parser job with export_to_pdf.jsx.
        
        Args:
            job_id: Job identifier
            input_path: Path to input .ai file
            output_dir: Output directory (working directory)
            timeout: Timeout in seconds (uses config default if None)
            
        Returns:
            Dict with job results
            
        Raises:
            IllustratorError: If job fails
            IllustratorTimeoutError: If job times out
        """
        if timeout is None:
            timeout = config.ILLUSTRATOR_TIMEOUT
        
        logger.info(f"Starting job {job_id}")
        logger.info(f"Input: {input_path}")
        logger.info(f"Output: {output_dir}")
        
        # Validate input
        if not input_path.exists():
            raise IllustratorError(f"Input file not found: {input_path}")
        
        # Ensure output directory exists
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Write runtime job.jsx
        self._write_runtime_job_jsx(job_id, input_path, output_dir)
        
        # Define sentinel files
        done_sentinel = output_dir / f"{job_id}_jsx_done.txt"
        error_sentinel = output_dir / f"{job_id}_error.json"
        
        # Remove old sentinels if they exist
        done_sentinel.unlink(missing_ok=True)
        error_sentinel.unlink(missing_ok=True)
        
        # Run JSX
        start_time = time.time()
        
        try:
            self.run_jsx(config.JSX_EXPORT_TO_PDF, timeout)
        except IllustratorTimeoutError:
            # Check if sentinel appeared despite timeout
            if not done_sentinel.exists():
                raise
        
        # Wait for sentinel file (JSX may take time to write it)
        sentinel_timeout = 30  # Additional 30s for sentinel
        if not self._wait_for_file(done_sentinel, sentinel_timeout):
            # Check for error sentinel
            if error_sentinel.exists():
                error_data = self._read_error_sentinel(error_sentinel)
                raise IllustratorError(
                    f"JSX reported error: {error_data.get('error', {}).get('message', 'Unknown error')}"
                )
            
            raise IllustratorError("JSX did not write completion sentinel")
        
        elapsed = time.time() - start_time
        logger.info(f"Job completed in {elapsed:.2f}s")
        
        # Load scratch JSON if available
        scratch_path = output_dir / f"{job_id}_scratch.json"
        scratch_data = None
        if scratch_path.exists():
            import json
            try:
                with open(scratch_path, 'r', encoding='utf-8') as f:
                    scratch_data = json.load(f)
            except Exception as e:
                logger.warning(f"Could not load scratch JSON: {e}")
        
        return {
            "success": True,
            "elapsed": elapsed,
            "scratch_data": scratch_data
        }
    
    def health_check(self) -> bool:
        """
        Run health check to verify Illustrator is working.
        
        Returns:
            True if health check passes
            
        Raises:
            IllustratorError: If health check fails
        """
        logger.info("Running Illustrator health check...")
        
        # Kill any existing instances
        self.kill_illustrator()
        
        # Run test script
        try:
            self.run_jsx(config.JSX_TEST_OPEN, timeout=60)
        except IllustratorTimeoutError:
            raise IllustratorError("Health check timed out")
        
        # Check for success sentinel
        success_file = Path(os.environ.get("TEMP", "/tmp")) / "illustrator_health_check_success.txt"
        error_file = Path(os.environ.get("TEMP", "/tmp")) / "illustrator_health_check_error.txt"
        
        if error_file.exists():
            try:
                error_msg = error_file.read_text(encoding='utf-8')
                error_file.unlink()
                raise IllustratorError(f"Health check failed: {error_msg}")
            except Exception as e:
                raise IllustratorError(f"Health check failed: {e}")
        
        if not success_file.exists():
            raise IllustratorError("Health check did not complete")
        
        # Read version from success file
        try:
            version_info = success_file.read_text(encoding='utf-8')
            success_file.unlink()
            logger.info(f"Health check passed: {version_info}")
        except Exception as e:
            logger.warning(f"Could not read version info: {e}")
        
        return True
    
    def _write_runtime_job_jsx(self, job_id: str, input_path: Path, output_dir: Path):
        """
        Write runtime/job.jsx with job configuration.
        
        Args:
            job_id: Job identifier
            input_path: Path to input .ai file
            output_dir: Output directory
        """
        # Convert paths to forward slashes for ExtendScript
        def escape_path(p: Path) -> str:
            return str(p).replace("\\", "/")
        
        job_jsx_content = f'''var __JOB = {{
  input: "{escape_path(input_path)}",
  output: "{escape_path(output_dir)}",
  job_id: "{job_id}"
}};
'''
        
        config.JSX_RUNTIME_JOB.parent.mkdir(parents=True, exist_ok=True)
        
        with open(config.JSX_RUNTIME_JOB, 'w', encoding='utf-8', newline='\n') as f:
            f.write(job_jsx_content)
        
        logger.debug(f"Wrote runtime job.jsx: {config.JSX_RUNTIME_JOB}")
    
    def _wait_for_file(self, path: Path, timeout: int) -> bool:
        """
        Wait for a file to exist.
        
        Args:
            path: File path
            timeout: Timeout in seconds
            
        Returns:
            True if file exists within timeout
        """
        start = time.time()
        while time.time() - start < timeout:
            if path.exists() and path.stat().st_size > 0:
                return True
            time.sleep(0.5)
        return False
    
    def _read_error_sentinel(self, error_path: Path) -> Dict[str, Any]:
        """
        Read error sentinel JSON.
        
        Args:
            error_path: Path to error JSON
            
        Returns:
            Error data dict
        """
        import json
        try:
            with open(error_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Could not read error sentinel: {e}")
            return {"error": {"message": "Unknown error"}}


def run_health_check():
    """
    Convenience function to run health check.
    
    Returns:
        True if health check passes
        
    Raises:
        IllustratorError: If health check fails
    """
    runner = IllustratorRunner()
    return runner.health_check()


def run_export_job(job_id: str, input_path: Path, output_dir: Path, 
                   timeout: int = None) -> Dict[str, Any]:
    """
    Convenience function to run export job.
    
    Args:
        job_id: Job identifier
        input_path: Path to input .ai file
        output_dir: Output directory
        timeout: Timeout in seconds (uses config default if None)
        
    Returns:
        Dict with job results
        
    Raises:
        IllustratorError: If job fails
        IllustratorTimeoutError: If job times out
    """
    runner = IllustratorRunner()
    
    # Kill any existing Illustrator instances before starting
    runner.kill_illustrator()
    
    return runner.run_job(job_id, input_path, output_dir, timeout)

