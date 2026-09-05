"""Compatibility module kept for deployments that still reference it.

Billing/payment enforcement has been intentionally disabled for now.
The application runs directly from backend.main:app.
"""
from backend.main import app
