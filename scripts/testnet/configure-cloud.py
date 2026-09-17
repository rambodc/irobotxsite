import subprocess,time
# Idempotent operator setup. Run before the GitHub Functions release.
# This script never reads a wallet seed.
P='irobotxsite'
def run(*args):
 for attempt in range(5):
  r=subprocess.run(['gcloud',*args,'--project='+P,'--quiet'],capture_output=True,text=True)
  if not r.returncode: break
  if 'does not exist' not in r.stderr: raise RuntimeError(r.stderr)
  time.sleep(2)
 if r.returncode: raise RuntimeError(r.stderr)
 return r.stdout
run('services','enable','cloudtasks.googleapis.com','secretmanager.googleapis.com')
for name in ['xrpl-testnet-api','xrpl-testnet-signer']:
 email=f'{name}@{P}.iam.gserviceaccount.com'
 try:run('iam','service-accounts','describe',email)
 except RuntimeError:run('iam','service-accounts','create',name,'--display-name='+name)
 for role in ['roles/datastore.user','roles/firebaseauth.viewer','roles/logging.logWriter','roles/cloudtasks.enqueuer']:
  run('projects','add-iam-policy-binding',P,'--member=serviceAccount:'+email,'--role='+role,'--condition=None')
 run('iam','service-accounts','add-iam-policy-binding',email,'--member=serviceAccount:github-deploy@irobotxsite.iam.gserviceaccount.com','--role=roles/iam.serviceAccountUser')
 run('iam','service-accounts','add-iam-policy-binding',email,'--member=serviceAccount:'+email,'--role=roles/iam.serviceAccountUser')
run('projects','add-iam-policy-binding',P,'--member=serviceAccount:github-deploy@irobotxsite.iam.gserviceaccount.com','--role=roles/cloudtasks.admin','--condition=None')
print('Dedicated API and signing identities configured.')

# Provision wallets before this binding if the secrets do not yet exist.
try:
 run('secrets','describe','XRPL_TESTNET_TRADER_SEED')
 run('secrets','add-iam-policy-binding','XRPL_TESTNET_TRADER_SEED','--member=serviceAccount:xrpl-testnet-signer@irobotxsite.iam.gserviceaccount.com','--role=roles/secretmanager.secretAccessor')
except RuntimeError:
 print('Trader secret not available yet; run provision.mjs, then rerun cloud configuration.')
# firebase-tools 14.15.2 requires a nonempty existing task queue IAM policy.
try:
 run('tasks','queues','describe','testnetWorker','--location=us-central1')
except RuntimeError:
 run('tasks','queues','create','testnetWorker','--location=us-central1')
run('tasks','queues','add-iam-policy-binding','testnetWorker','--location=us-central1','--member=serviceAccount:xrpl-testnet-api@irobotxsite.iam.gserviceaccount.com','--role=roles/cloudtasks.enqueuer')
