"""
Quick verification script to check if parser-service results are correct.
Usage: python verify_results.py <job-id>
"""

import sys
import json
from pathlib import Path

def verify_job_results(job_id):
    """Verify results for a job ID."""
    
    print(f"=" * 60)
    print(f"Verifying Job: {job_id}")
    print(f"=" * 60)
    
    # Check working directory
    working_dir = Path("jobs/working") / job_id
    if not working_dir.exists():
        print(f"❌ Working directory not found: {working_dir}")
        return False
    
    print(f"✓ Working directory exists: {working_dir}")
    
    # Check JSX debug log
    jsx_log = working_dir / f"{job_id}_jsx_debug.log"
    if jsx_log.exists():
        print(f"✓ JSX debug log exists")
        
        # Read and analyze log
        log_content = jsx_log.read_text(encoding='utf-8', errors='ignore')
        
        # Check for successful completion
        if "JOB COMPLETED SUCCESSFULLY" in log_content:
            print(f"  ✓ JSX completed successfully")
        else:
            print(f"  ❌ JSX did not complete successfully")
        
        # Check for detection
        if "Detection completed" in log_content:
            print(f"  ✓ Finish detection ran")
            # Extract finishes
            for line in log_content.split('\n'):
                if "Detection completed. Finishes found:" in line:
                    print(f"    {line.strip()}")
        
        # Check for recoloring
        if "Starting Recoloring Phase" in log_content:
            print(f"  ✓ Recoloring phase ran")
            # Extract recoloring stats
            for line in log_content.split('\n'):
                if "Total sub-items recolored:" in line:
                    print(f"    {line.strip()}")
                    count = line.split(":")[-1].strip()
                    if count == "0":
                        print(f"    ⚠️  WARNING: No items were recolored!")
        
    else:
        print(f"❌ JSX debug log not found")
    
    # Check PDF
    pdf_path = working_dir / f"{job_id}.pdf"
    if pdf_path.exists():
        print(f"✓ PDF exists: {pdf_path}")
        size_mb = pdf_path.stat().st_size / (1024 * 1024)
        print(f"  Size: {size_mb:.2f} MB")
    else:
        print(f"❌ PDF not found")
    
    # Check scratch JSON
    scratch_json = working_dir / f"{job_id}_scratch.json"
    if scratch_json.exists():
        print(f"✓ Scratch JSON exists")
        try:
            data = json.loads(scratch_json.read_text())
            if "sides" in data:
                for side in data["sides"]:
                    finishes = side.get("finishes", [])
                    print(f"  Side: {side.get('side')}, Finishes: {finishes}")
        except Exception as e:
            print(f"  ⚠️  Could not parse JSON: {e}")
    else:
        print(f"❌ Scratch JSON not found")
    
    # Check plates directory
    plates_dir = working_dir / f"{job_id}__plates"
    if plates_dir.exists():
        print(f"✓ Plates directory exists")
        tif_files = list(plates_dir.glob("*.tif"))
        print(f"  Found {len(tif_files)} TIFF plates:")
        for tif in tif_files:
            print(f"    - {tif.name}")
    else:
        print(f"❌ Plates directory not found (Ghostscript didn't run?)")
    
    # Check results directory
    results_dir = Path("jobs/results") / job_id
    if not results_dir.exists():
        print(f"❌ Results directory not found: {results_dir}")
        return False
    
    print(f"✓ Results directory exists: {results_dir}")
    
    # List all output files
    output_files = list(results_dir.glob("*"))
    print(f"  Output files ({len(output_files)}):")
    for f in sorted(output_files):
        if f.is_file():
            size_kb = f.stat().st_size / 1024
            print(f"    - {f.name} ({size_kb:.1f} KB)")
    
    # Check for report.json
    report_path = results_dir / "report.json"
    if report_path.exists():
        print(f"✓ Report JSON exists")
        try:
            report = json.loads(report_path.read_text())
            plates = report.get("plates_detected", [])
            print(f"  Plates detected: {plates}")
            outputs = report.get("outputs", {})
            print(f"  Outputs defined: {len(outputs)}")
        except Exception as e:
            print(f"  ⚠️  Could not parse report: {e}")
    else:
        print(f"❌ Report JSON not found")
    
    print(f"=" * 60)
    
    # Summary
    print("\n📊 Summary:")
    
    expected_files = ["front_layer_0_albedo.png"]
    optional_files = ["front_layer_0_uv.png", "front_layer_0_foil.png", 
                     "front_layer_0_emboss.png", "front_layer_0_diecut_mask.png",
                     "back_layer_0_albedo.png", "back_layer_0_uv.png",
                     "back_layer_0_foil.png"]
    
    found_count = 0
    missing_count = 0
    
    for exp in expected_files:
        if (results_dir / exp).exists():
            print(f"  ✓ {exp}")
            found_count += 1
        else:
            print(f"  ❌ {exp} (REQUIRED)")
            missing_count += 1
    
    for opt in optional_files:
        if (results_dir / opt).exists():
            print(f"  ✓ {opt}")
            found_count += 1
    
    print(f"\nTotal files found: {found_count}")
    if missing_count > 0:
        print(f"❌ Missing required files: {missing_count}")
        return False
    
    print(f"✅ Job verification complete!")
    return True


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python verify_results.py <job-id>")
        print("\nTo find job IDs, check:")
        print("  - jobs/results/")
        print("  - jobs/working/")
        print("  - jobs/failed/")
        sys.exit(1)
    
    job_id = sys.argv[1]
    success = verify_job_results(job_id)
    sys.exit(0 if success else 1)

