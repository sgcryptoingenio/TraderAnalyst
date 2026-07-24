import re

with open('backend/main.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update imports
content = content.replace("from database import get_db_connection", "from database import get_db")

# 2. Add db = Depends(get_db) to all endpoint signatures and remove conn = get_db_connection()
# This is tricky because signatures vary.
# Let's replace the common pattern:
# def func_name(...):
#     conn = get_db_connection()

def replacer(match):
    # match.group(1) is the function definition up to the colon
    # match.group(2) is the whitespace before conn = ...
    func_def = match.group(1)
    
    # We need to add `db = Depends(get_db)` to the function signature
    # If the signature already has arguments, add a comma
    if func_def.strip().endswith("()"):
        new_func_def = func_def.replace("()", "(db = Depends(get_db))")
    else:
        # It has arguments.
        new_func_def = func_def.replace("):", ", db = Depends(get_db)):")
        
    return new_func_def + match.group(2) + "conn = db"

# Regex to find: def function_name(...):\n    conn = get_db_connection()
pattern = r'(def\s+[a-zA-Z0-9_]+\s*\([^)]*\)\s*:)(\s*)conn\s*=\s*get_db_connection\(\)'

content = re.sub(pattern, replacer, content)

# 3. Remove all conn.close() calls
content = content.replace("conn.close()", "")
content = content.replace("        \n", "\n") # clean up empty lines left by conn.close()

# 4. Special case for analyze_history which is deeply nested:
# 134: async def analyze_history(
# 135:     file: UploadFile = File(...),
# 136:     target_symbol: str = Form(None),
# 137:     user_id: int = Depends(get_current_user)
# 138: ):
# ...
# 160:             conn = get_db_connection()

if "def analyze_history(" in content:
    content = content.replace(
        "    user_id: int = Depends(get_current_user)\n):",
        "    user_id: int = Depends(get_current_user),\n    db = Depends(get_db)\n):"
    )
    content = content.replace("conn = get_db_connection()", "conn = db")

with open('backend/main.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Refactor complete.")
