from fastapi import FastAPI, File, UploadFile, HTTPException, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import os
from datetime import datetime
from pathlib import Path
import uuid
import asyncio
import pandas as pd
from typing import Optional
from pydantic import BaseModel
import json
from pymongo import MongoClient
from bson import ObjectId
import uvicorn

# Import the emergentintegrations library
from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType

# MongoDB setup
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/churn_prediction_db')
client = MongoClient(mongo_url)
db = client.churn_prediction_db

# FastAPI app setup
app = FastAPI(title="Customer Churn Prediction API", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class ChurnAnalysisResult(BaseModel):
    analysis_id: str
    filename: str
    status: str
    created_at: datetime
    total_customers: Optional[int] = None
    high_risk_customers: Optional[int] = None
    predictions: Optional[list] = None
    insights: Optional[str] = None
    recommendations: Optional[str] = None

class ChurnPrediction(BaseModel):
    customer_id: str
    customer_name: Optional[str] = None
    churn_probability: float
    risk_level: str
    key_factors: list
    recommended_actions: list

# Ensure upload directory exists
UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

@app.get("/")
async def root():
    return {"message": "Customer Churn Prediction API is running!"}

@app.get("/api/health")
async def health_check():
    try:
        # Test database connection
        db.churn_analyses.find_one()
        return {"status": "healthy", "timestamp": datetime.now()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")

@app.post("/api/upload-csv")
async def upload_csv(file: UploadFile = File(...)):
    """Upload CSV file and start churn analysis"""
    
    # Validate file type
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")
    
    try:
        # Generate unique analysis ID
        analysis_id = str(uuid.uuid4())
        
        # Save uploaded file
        file_path = UPLOAD_DIR / f"{analysis_id}_{file.filename}"
        contents = await file.read()
        
        with open(file_path, "wb") as f:
            f.write(contents)
        
        # Save initial analysis record
        analysis_record = {
            "analysis_id": analysis_id,
            "filename": file.filename,
            "file_path": str(file_path),
            "status": "processing",
            "created_at": datetime.now(),
            "total_customers": None,
            "high_risk_customers": None,
            "predictions": None,
            "insights": None,
            "recommendations": None
        }
        
        result = db.churn_analyses.insert_one(analysis_record)
        
        # Start background analysis
        asyncio.create_task(analyze_churn_data(analysis_id, str(file_path), file.filename))
        
        return {
            "analysis_id": analysis_id,
            "message": "File uploaded successfully. Analysis started.",
            "status": "processing"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")

async def analyze_churn_data(analysis_id: str, file_path: str, filename: str):
    """Background task to analyze churn data using Gemini AI"""
    
    try:
        # Read CSV for basic info
        df = pd.read_csv(file_path)
        total_customers = len(df)
        
        # Initialize Gemini chat
        gemini_api_key = os.environ.get('GEMINI_API_KEY')
        if not gemini_api_key:
            raise Exception("GEMINI_API_KEY not found in environment variables")
            
        chat = LlmChat(
            api_key=gemini_api_key,
            session_id=f"churn_analysis_{analysis_id}",
            system_message="""You are an expert customer churn prediction analyst. 
            Analyze the provided CSV data and provide detailed insights about customer churn patterns.
            
            Please provide your analysis in JSON format with the following structure:
            {
                "total_customers": number,
                "high_risk_customers": number,
                "predictions": [
                    {
                        "customer_id": "string",
                        "customer_name": "string or null",
                        "churn_probability": 0.85,
                        "risk_level": "High/Medium/Low",
                        "key_factors": ["factor1", "factor2"],
                        "recommended_actions": ["action1", "action2"]
                    }
                ],
                "insights": "Detailed analysis insights about churn patterns, trends, and key findings",
                "recommendations": "Strategic recommendations for reducing customer churn"
            }
            
            Focus on identifying:
            1. High-risk customers (>70% churn probability)
            2. Key factors contributing to churn
            3. Actionable recommendations for retention
            4. Overall patterns and trends
            """
        ).with_model("gemini", "gemini-2.0-flash")
        
        # Create file attachment for Gemini
        csv_file = FileContentWithMimeType(
            file_path=file_path,
            mime_type="text/csv"
        )
        
        # Send analysis request to Gemini
        user_message = UserMessage(
            text=f"""Please analyze this customer data CSV file for churn prediction. 
            The file contains {total_customers} customer records. 
            
            Provide comprehensive churn analysis including individual customer risk assessments, 
            key churn indicators, and strategic recommendations for customer retention.
            
            Return the response in valid JSON format as specified in your system message.""",
            file_contents=[csv_file]
        )
        
        # Get AI analysis
        response = await chat.send_message(user_message)
        
        # Parse AI response
        try:
            # Extract JSON from response (handle potential markdown formatting)
            response_text = response.strip()
            if response_text.startswith('```json'):
                response_text = response_text.replace('```json', '').replace('```', '').strip()
            elif response_text.startswith('```'):
                response_text = response_text.replace('```', '').strip()
                
            analysis_result = json.loads(response_text)
            
            # Update database with results
            update_data = {
                "status": "completed",
                "completed_at": datetime.now(),
                "total_customers": analysis_result.get("total_customers", total_customers),
                "high_risk_customers": analysis_result.get("high_risk_customers", 0),
                "predictions": analysis_result.get("predictions", []),
                "insights": analysis_result.get("insights", ""),
                "recommendations": analysis_result.get("recommendations", "")
            }
            
            db.churn_analyses.update_one(
                {"analysis_id": analysis_id},
                {"$set": update_data}
            )
            
        except json.JSONDecodeError as e:
            # If JSON parsing fails, save the raw response
            db.churn_analyses.update_one(
                {"analysis_id": analysis_id},
                {"$set": {
                    "status": "completed_with_errors",
                    "error": f"JSON parsing error: {str(e)}",
                    "raw_response": response,
                    "total_customers": total_customers,
                    "completed_at": datetime.now()
                }}
            )
            
    except Exception as e:
        # Update with error status
        db.churn_analyses.update_one(
            {"analysis_id": analysis_id},
            {"$set": {
                "status": "failed",
                "error": str(e),
                "completed_at": datetime.now()
            }}
        )

@app.get("/api/analysis/{analysis_id}")
async def get_analysis_status(analysis_id: str):
    """Get analysis status and results"""
    
    analysis = db.churn_analyses.find_one({"analysis_id": analysis_id})
    
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    # Convert ObjectId to string for JSON serialization
    if "_id" in analysis:
        del analysis["_id"]
    
    return analysis

@app.get("/api/analyses")
async def get_all_analyses():
    """Get all analyses with pagination"""
    
    analyses = list(db.churn_analyses.find().sort("created_at", -1).limit(20))
    
    # Convert ObjectIds to strings
    for analysis in analyses:
        if "_id" in analysis:
            del analysis["_id"]
    
    return {"analyses": analyses}

@app.delete("/api/analysis/{analysis_id}")
async def delete_analysis(analysis_id: str):
    """Delete an analysis and its associated file"""
    
    analysis = db.churn_analyses.find_one({"analysis_id": analysis_id})
    
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    try:
        # Delete file if it exists
        if "file_path" in analysis and os.path.exists(analysis["file_path"]):
            os.remove(analysis["file_path"])
        
        # Delete from database
        db.churn_analyses.delete_one({"analysis_id": analysis_id})
        
        return {"message": "Analysis deleted successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete analysis: {str(e)}")

@app.get("/api/sample-csv")
async def download_sample_csv():
    """Generate a sample CSV for testing"""
    
    sample_data = {
        'customer_id': ['CUST001', 'CUST002', 'CUST003', 'CUST004', 'CUST005'],
        'customer_name': ['John Smith', 'Jane Doe', 'Bob Johnson', 'Alice Brown', 'Charlie Wilson'],
        'age': [35, 28, 45, 31, 52],
        'monthly_charges': [65.5, 89.2, 120.0, 45.0, 95.5],
        'total_charges': [1500.5, 2800.0, 5200.0, 800.0, 3500.0],
        'contract_length': [12, 24, 36, 6, 24],
        'support_calls': [2, 5, 1, 8, 3],
        'payment_method': ['Credit Card', 'Bank Transfer', 'Credit Card', 'Cash', 'Bank Transfer'],
        'internet_service': ['Fiber', 'DSL', 'Fiber', 'DSL', 'Fiber'],
        'customer_satisfaction': [8, 6, 9, 3, 7]
    }
    
    return sample_data

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)