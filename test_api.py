import requests

try:
    with open('test.csv', 'rb') as f:
        # Provide dummy token or depend on how the auth works. 
        # Actually /api/analyze requires authentication: user_id: int = Depends(get_current_user)
        # So we might get a 401 Unauthorized here. 
        headers = {} # If we need token, we can mock or just see if we get 401
        r = requests.post('http://127.0.0.1:8000/api/analyze', files={'file': f}, headers=headers)
        print("Status code:", r.status_code)
        print("Response:", r.text)
except Exception as e:
    print("Error:", e)
