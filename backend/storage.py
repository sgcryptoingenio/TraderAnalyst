import os
import shutil

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        from supabase import create_client, Client
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except ImportError:
        print("La librería supabase no está instalada, se usará almacenamiento local.")

def save_file(temp_file_path, unique_filename):
    """
    Guarda el archivo en Supabase Storage (bucket 'reports') si está configurado,
    de lo contrario lo guarda localmente en la carpeta 'uploads/'.
    Devuelve la ruta (file_path) para guardar en la BD.
    """
    if supabase:
        try:
            with open(temp_file_path, "rb") as f:
                # Asegurarse que el bucket 'reports' exista en Supabase
                supabase.storage.from_("reports").upload(unique_filename, f)
            return f"supabase://{unique_filename}"
        except Exception as e:
            print(f"Error subiendo a Supabase, usando fallback local: {e}")
            
    os.makedirs("uploads", exist_ok=True)
    perm_file_path = f"uploads/{unique_filename}"
    shutil.copy(temp_file_path, perm_file_path)
    return perm_file_path

def get_file(saved_file_path, temp_download_path):
    """
    Recupera el archivo. Si es de Supabase, lo descarga a temp_download_path.
    Si es local, verifica si existe y devuelve su ruta.
    Retorna la ruta del archivo local listo para leer.
    """
    if saved_file_path.startswith("supabase://"):
        if not supabase:
            raise Exception("El archivo está en Supabase pero no se han configurado las variables SUPABASE_URL y SUPABASE_KEY")
        filename = saved_file_path.replace("supabase://", "")
        with open(temp_download_path, "wb") as f:
            res = supabase.storage.from_("reports").download(filename)
            f.write(res)
        return temp_download_path
    else:
        if not os.path.exists(saved_file_path):
            raise Exception("El archivo local ya no está disponible.")
        return saved_file_path

def delete_file(saved_file_path):
    if saved_file_path.startswith("supabase://"):
        if supabase:
            filename = saved_file_path.replace("supabase://", "")
            try:
                supabase.storage.from_("reports").remove([filename])
            except Exception as e:
                print(f"Error borrando de Supabase: {e}")
    else:
        if os.path.exists(saved_file_path):
            try:
                os.remove(saved_file_path)
            except:
                pass
