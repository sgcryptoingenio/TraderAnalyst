with open('backend/main.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if line.startswith("def get_history(user_id: int = Depends(get_current_user)):"):
        lines[i] = "def get_history(user_id: int = Depends(get_current_user), db = Depends(get_db)):\n"
    elif line.startswith("def get_all_users(admin_payload: dict = Depends(require_admin)):"):
        lines[i] = "def get_all_users(admin_payload: dict = Depends(require_admin), db = Depends(get_db)):\n"
    elif line.startswith("def get_all_reports(admin_payload: dict = Depends(require_admin)):"):
        lines[i] = "def get_all_reports(admin_payload: dict = Depends(require_admin), db = Depends(get_db)):\n"
    elif line.startswith("async def get_report_details(report_id: int, user_id: int = Depends(get_current_user)):"):
        lines[i] = "async def get_report_details(report_id: int, user_id: int = Depends(get_current_user), db = Depends(get_db)):\n"
    elif line.startswith("async def admin_delete_user(target_id: int, user_id: int = Depends(get_current_user)):"):
        lines[i] = "async def admin_delete_user(target_id: int, user_id: int = Depends(get_current_user), db = Depends(get_db)):\n"
    elif line.startswith("async def change_user_role(target_id: int, user_id: int = Depends(get_current_user)):"):
        lines[i] = "async def change_user_role(target_id: int, user_id: int = Depends(get_current_user), db = Depends(get_db)):\n"
    elif line.startswith("def get_settings(, db = Depends(get_db)):"):
        lines[i] = "def get_settings(db = Depends(get_db)):\n"
    elif line.startswith("def update_settings(settings: SettingsUpdate, admin_payload: dict = Depends(require_admin)):"):
        lines[i] = "def update_settings(settings: SettingsUpdate, admin_payload: dict = Depends(require_admin), db = Depends(get_db)):\n"
    elif line.startswith("async def admin_analyze_report_symbol(report_id: int, req: AnalyzeRequest, user_id: int = Depends(get_current_user)):"):
        lines[i] = "async def admin_analyze_report_symbol(report_id: int, req: AnalyzeRequest, user_id: int = Depends(get_current_user), db = Depends(get_db)):\n"
    elif line.startswith("async def download_report(report_id: int, user_id: int = Depends(get_current_user)):"):
        lines[i] = "async def download_report(report_id: int, user_id: int = Depends(get_current_user), db = Depends(get_db)):\n"

with open('backend/main.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)
