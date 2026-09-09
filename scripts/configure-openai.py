#!/usr/bin/env python3
"""Secure local entry for the demo's server-side OpenAI API key."""
import json, subprocess, urllib.request, urllib.error
prompt = 'Enter the OpenAI API key for iRobotX AI Chat. It will be stored in Google Secret Manager, never in the website or repository.'
result = subprocess.run(['osascript', '-e', 'text returned of (display dialog '+json.dumps(prompt)+' default answer "" with hidden answer buttons {"Cancel", "Save securely"} default button "Save securely" with title "iRobotX AI setup")'], capture_output=True, text=True)
if result.returncode: raise SystemExit('Key entry cancelled. Nothing stored.')
key = result.stdout.strip()
if not key.startswith('sk-') or len(key) < 25: raise SystemExit('That does not look like an OpenAI API key. Nothing stored.')
try:
    request = urllib.request.Request('https://api.openai.com/v1/models/gpt-5.6-terra', headers={'Authorization':'Bearer '+key})
    with urllib.request.urlopen(request, timeout=25) as response: response.read()
except urllib.error.HTTPError as error: raise SystemExit('OpenAI could not verify model access (HTTP '+str(error.code)+'). Nothing stored.')
except Exception: raise SystemExit('OpenAI could not be reached. Nothing stored.')
args = ['--project', 'irobotxsite']
if subprocess.run(['gcloud','secrets','describe','OPENAI_API_KEY',*args], capture_output=True).returncode:
    subprocess.run(['gcloud','secrets','create','OPENAI_API_KEY','--replication-policy=automatic',*args], check=True, capture_output=True)
subprocess.run(['gcloud','secrets','versions','add','OPENAI_API_KEY','--data-file=-',*args], input=key, text=True, check=True, capture_output=True)
print('OpenAI model access verified. Key stored securely in Secret Manager.')
