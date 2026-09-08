#!/usr/bin/env python3
"""Store the Gmail app password without printing it or writing a plaintext file."""
import argparse, getpass, json, subprocess
parser=argparse.ArgumentParser();parser.add_argument('--dialog',action='store_true');parser.add_argument('--username',default='rambodc@irobotx.io');args=parser.parse_args()
if args.dialog:
 result=subprocess.run(['osascript','-e','text returned of (display dialog '+json.dumps('Enter the Gmail app password for '+args.username+'. The website will send as info@irobotx.io. Your password goes directly to Google Secret Manager.')+' default answer "" with hidden answer buttons {"Cancel", "Save securely"} default button "Save securely" with title "iRobotX email setup")'],capture_output=True,text=True)
 if result.returncode: print('Email setup cancelled. No password was stored.');raise SystemExit(1)
 password=result.stdout.strip().replace(' ','')
else: password=getpass.getpass('Gmail app password for '+args.username+': ').replace(' ','')
if len(password)!=16: raise SystemExit('Expected a 16-character Gmail app password. Nothing stored.')
# Verify the mailbox credentials before saving the secret.
import smtplib,ssl
try:
 with smtplib.SMTP_SSL('smtp.gmail.com',465,context=ssl.create_default_context(),timeout=20) as smtp:smtp.login(args.username,password)
except Exception as e:raise SystemExit('Gmail authentication failed ('+str(getattr(e,'smtp_code',type(e).__name__))+'). Nothing stored. Check the mailbox and app password.')
project=['--project','irobotxsite']
exists=subprocess.run(['gcloud','secrets','describe','SMTP_CONFIG',*project],capture_output=True)
if exists.returncode:subprocess.run(['gcloud','secrets','create','SMTP_CONFIG','--replication-policy=automatic',*project],check=True,capture_output=True)
subprocess.run(['gcloud','secrets','versions','add','SMTP_CONFIG','--data-file=-',*project],input=json.dumps({'enabled':True,'username':args.username,'password':password}),text=True,check=True,capture_output=True)
print('Mailbox verified. Gmail credentials stored securely. Redeploy Functions to bind the new version.')
