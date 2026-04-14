import requests
import sys
import json
from datetime import datetime

class YACommerceAPITester:
    def __init__(self, base_url="https://product-review-hub-6.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        if headers is None:
            headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                except:
                    print(f"   Response: {response.text[:200]}...")
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:300]}...")
                self.failed_tests.append({
                    "test": name,
                    "expected": expected_status,
                    "actual": response.status_code,
                    "response": response.text[:300]
                })

            return success, response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text

        except requests.exceptions.Timeout:
            print(f"❌ Failed - Request timeout")
            self.failed_tests.append({"test": name, "error": "Request timeout"})
            return False, {}
        except requests.exceptions.ConnectionError:
            print(f"❌ Failed - Connection error")
            self.failed_tests.append({"test": name, "error": "Connection error"})
            return False, {}
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.failed_tests.append({"test": name, "error": str(e)})
            return False, {}

    def test_health_endpoint(self):
        """Test the health endpoint"""
        return self.run_test(
            "Health Check",
            "GET",
            "api/health",
            200
        )

    def test_email_otp_send(self):
        """Test sending email OTP"""
        test_email = f"test_{datetime.now().strftime('%H%M%S')}@example.com"
        return self.run_test(
            "Send Email OTP",
            "POST",
            "api/auth/email/send-otp",
            200,
            data={"email": test_email}
        )

    def test_email_otp_send_invalid(self):
        """Test sending email OTP with invalid email"""
        return self.run_test(
            "Send Email OTP (Invalid Email)",
            "POST",
            "api/auth/email/send-otp",
            400,
            data={"email": "invalid-email"}
        )

    def test_phone_otp_send(self):
        """Test sending phone OTP"""
        test_phone = "9876543210"
        return self.run_test(
            "Send Phone OTP",
            "POST",
            "api/auth/phone/send-otp",
            200,
            data={"phone": test_phone}
        )

    def test_phone_otp_send_invalid(self):
        """Test sending phone OTP with invalid phone"""
        return self.run_test(
            "Send Phone OTP (Invalid Phone)",
            "POST",
            "api/auth/phone/send-otp",
            400,
            data={"phone": "123"}
        )

    def test_email_otp_verify_invalid(self):
        """Test verifying email OTP with invalid data"""
        return self.run_test(
            "Verify Email OTP (Invalid)",
            "POST",
            "api/auth/email/verify-otp",
            400,
            data={"email": "test@example.com", "otp": "000000"}
        )

    def test_phone_otp_verify_invalid(self):
        """Test verifying phone OTP with invalid data"""
        return self.run_test(
            "Verify Phone OTP (Invalid)",
            "POST",
            "api/auth/phone/verify-otp",
            400,
            data={"phone": "9876543210", "otp": "000000"}
        )

def main():
    print("🚀 Starting YA Commerce Backend API Tests")
    print("=" * 50)
    
    tester = YACommerceAPITester()

    # Test health endpoint
    tester.test_health_endpoint()

    # Test auth endpoints
    tester.test_email_otp_send()
    tester.test_email_otp_send_invalid()
    tester.test_phone_otp_send()
    tester.test_phone_otp_send_invalid()
    tester.test_email_otp_verify_invalid()
    tester.test_phone_otp_verify_invalid()

    # Print results
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if tester.failed_tests:
        print("\n❌ Failed Tests:")
        for failed in tester.failed_tests:
            error_msg = failed.get('error', f"Expected {failed.get('expected')}, got {failed.get('actual')}")
            print(f"   - {failed['test']}: {error_msg}")
    
    success_rate = (tester.tests_passed / tester.tests_run) * 100 if tester.tests_run > 0 else 0
    print(f"📈 Success Rate: {success_rate:.1f}%")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())