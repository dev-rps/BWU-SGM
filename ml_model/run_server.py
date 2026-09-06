"""
run_server.py — Convenience script to start the FastAPI ML backend on port 8000
"""
import uvicorn

if __name__ == "__main__":
    print("🚀 Starting Safety Guardian ML Service on http://127.0.0.1:8000 ...")
    uvicorn.run("ml_model.main:app", host="127.0.0.1", port=8000, reload=True)
