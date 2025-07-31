import requests
import sys
import json
import time
from datetime import datetime
import io

class ChurnPredictionAPITester:
    def __init__(self, base_url="https://037f1af9-9dd9-4aec-ac50-d49e76119495.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.analysis_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {}
        if data and not files:
            headers['Content-Type'] = 'application/json'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                if files:
                    response = requests.post(url, files=files)
                else:
                    response = requests.post(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test health check endpoint"""
        return self.run_test("Health Check", "GET", "api/health", 200)

    def test_root_endpoint(self):
        """Test root endpoint"""
        return self.run_test("Root Endpoint", "GET", "", 200)

    def test_sample_csv_download(self):
        """Test sample CSV download"""
        success, response = self.run_test("Sample CSV Download", "GET", "api/sample-csv", 200)
        if success and response:
            # Verify it contains expected customer data structure
            expected_fields = ['customer_id', 'customer_name', 'age', 'monthly_charges']
            has_fields = all(field in response for field in expected_fields)
            if has_fields:
                print("   ✅ Sample CSV contains expected fields")
                return True, response
            else:
                print("   ❌ Sample CSV missing expected fields")
                return False, response
        return success, response

    def create_test_csv_file(self):
        """Create a test CSV file for upload"""
        csv_content = """customer_id,customer_name,age,monthly_charges,total_charges,contract_length,support_calls,payment_method,internet_service,customer_satisfaction
CUST001,John Smith,35,65.5,1500.5,12,2,Credit Card,Fiber,8
CUST002,Jane Doe,28,89.2,2800.0,24,5,Bank Transfer,DSL,6
CUST003,Bob Johnson,45,120.0,5200.0,36,1,Credit Card,Fiber,9
CUST004,Alice Brown,31,45.0,800.0,6,8,Cash,DSL,3
CUST005,Charlie Wilson,52,95.5,3500.0,24,3,Bank Transfer,Fiber,7"""
        
        return io.StringIO(csv_content)

    def test_csv_upload(self):
        """Test CSV file upload"""
        csv_file = self.create_test_csv_file()
        files = {'file': ('test_customers.csv', csv_file.getvalue(), 'text/csv')}
        
        success, response = self.run_test("CSV Upload", "POST", "api/upload-csv", 200, files=files)
        if success and 'analysis_id' in response:
            self.analysis_id = response['analysis_id']
            print(f"   ✅ Analysis ID: {self.analysis_id}")
            return True, response
        return success, response

    def test_invalid_file_upload(self):
        """Test uploading non-CSV file"""
        files = {'file': ('test.txt', 'This is not a CSV file', 'text/plain')}
        return self.run_test("Invalid File Upload", "POST", "api/upload-csv", 400, files=files)

    def test_analysis_status(self, analysis_id):
        """Test getting analysis status"""
        if not analysis_id:
            print("❌ No analysis ID available for status check")
            return False, {}
        
        return self.run_test("Analysis Status", "GET", f"api/analysis/{analysis_id}", 200)

    def test_analysis_completion(self, analysis_id, max_wait_time=60):
        """Wait for analysis to complete and test results"""
        if not analysis_id:
            print("❌ No analysis ID available for completion check")
            return False, {}

        print(f"\n⏳ Waiting for analysis {analysis_id} to complete (max {max_wait_time}s)...")
        start_time = time.time()
        
        while time.time() - start_time < max_wait_time:
            success, response = self.test_analysis_status(analysis_id)
            if success and response:
                status = response.get('status', 'unknown')
                print(f"   Status: {status}")
                
                if status == 'completed':
                    print("✅ Analysis completed successfully!")
                    # Verify response structure
                    required_fields = ['total_customers', 'predictions']
                    has_required = all(field in response for field in required_fields)
                    if has_required:
                        print(f"   ✅ Total customers: {response.get('total_customers', 0)}")
                        print(f"   ✅ High risk customers: {response.get('high_risk_customers', 0)}")
                        print(f"   ✅ Predictions count: {len(response.get('predictions', []))}")
                        if response.get('insights'):
                            print(f"   ✅ AI insights provided")
                        if response.get('recommendations'):
                            print(f"   ✅ AI recommendations provided")
                        return True, response
                    else:
                        print("   ❌ Response missing required fields")
                        return False, response
                        
                elif status == 'failed':
                    print(f"❌ Analysis failed: {response.get('error', 'Unknown error')}")
                    return False, response
                    
                elif status == 'processing':
                    print("   Still processing...")
                    time.sleep(5)
                    continue
                else:
                    print(f"   Unknown status: {status}")
                    time.sleep(5)
                    continue
            else:
                print("   Failed to get status")
                time.sleep(5)
                continue
        
        print(f"❌ Analysis did not complete within {max_wait_time} seconds")
        return False, {}

    def test_get_all_analyses(self):
        """Test getting all analyses"""
        return self.run_test("Get All Analyses", "GET", "api/analyses", 200)

    def test_delete_analysis(self, analysis_id):
        """Test deleting an analysis"""
        if not analysis_id:
            print("❌ No analysis ID available for deletion")
            return False, {}
        
        return self.run_test("Delete Analysis", "DELETE", f"api/analysis/{analysis_id}", 200)

    def test_nonexistent_analysis(self):
        """Test getting non-existent analysis"""
        fake_id = "nonexistent-analysis-id"
        return self.run_test("Non-existent Analysis", "GET", f"api/analysis/{fake_id}", 404)

def main():
    print("🚀 Starting Customer Churn Prediction API Tests")
    print("=" * 60)
    
    tester = ChurnPredictionAPITester()
    
    # Test basic endpoints
    print("\n📋 BASIC ENDPOINT TESTS")
    tester.test_root_endpoint()
    tester.test_health_check()
    
    # Test sample CSV
    print("\n📊 SAMPLE CSV TESTS")
    tester.test_sample_csv_download()
    
    # Test file upload
    print("\n📤 FILE UPLOAD TESTS")
    tester.test_invalid_file_upload()
    upload_success, upload_response = tester.test_csv_upload()
    
    if upload_success and tester.analysis_id:
        # Test analysis workflow
        print("\n🤖 AI ANALYSIS TESTS")
        completion_success, completion_response = tester.test_analysis_completion(tester.analysis_id, max_wait_time=120)
        
        # Test analysis retrieval
        print("\n📈 ANALYSIS RETRIEVAL TESTS")
        tester.test_get_all_analyses()
        
        # Test cleanup
        print("\n🗑️ CLEANUP TESTS")
        tester.test_delete_analysis(tester.analysis_id)
    
    # Test error cases
    print("\n❌ ERROR HANDLING TESTS")
    tester.test_nonexistent_analysis()
    
    # Print final results
    print("\n" + "=" * 60)
    print(f"📊 FINAL RESULTS: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())