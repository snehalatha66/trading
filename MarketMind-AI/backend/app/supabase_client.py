"""Supabase client utilities.
Provides a singleton ``supabase`` object using the service role key.
Only backend uses this client, so the service role key is never exposed to the
frontend.
"""

from supabase import create_client, Client
from .config import settings

# Create a global client instance
supabase: Client = create_client(str(settings.SUPABASE_URL), settings.SUPABASE_SERVICE_ROLE_KEY)
