import ast

def check_file(filename):
    print(f"\n--- Subtractions in {filename} ---")
    with open(filename, 'r', encoding='utf-8') as f:
        tree = ast.parse(f.read(), filename=filename)
    
    for node in ast.walk(tree):
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Sub):
            print(f"Line {node.lineno}: {ast.unparse(node)}")

check_file('backend/main.py')
check_file('backend/analyzer.py')
check_file('backend/ingestor.py')
