# Workload Identity Federation Setup Guide

## 🔐 Why Workload Identity Federation?

**Workload Identity Federation** eliminates the need for service account JSON keys by allowing your application to authenticate using:
- **GCP**: Attached service accounts (Cloud Run, GKE, Compute Engine)
- **AWS**: IAM roles via federation
- **Azure**: Managed identities via federation
- **Local**: Your gcloud authenticated user

**Benefits:**
- ✅ No long-lived credentials to manage
- ✅ No JSON keys to rotate or secure
- ✅ Automatic credential rotation
- ✅ Better security posture
- ✅ Compliance with `iam.disableServiceAccountKeyCreation`

---

## 🚀 Setup Instructions

### Option 1: Local Development (Recommended for Testing)

#### Step 1: Install Google Cloud SDK

```bash
# macOS
brew install --cask google-cloud-sdk

# Linux
curl https://sdk.cloud.google.com | bash

# Windows
# Download from: https://cloud.google.com/sdk/docs/install
```

#### Step 2: Authenticate with Your Google Account

```bash
# Login to Google Cloud
gcloud auth login

# Set your project
gcloud config set project YOUR_PROJECT_ID

# Set up Application Default Credentials
gcloud auth application-default login
```

This creates credentials at:
- **macOS/Linux**: `~/.config/gcloud/application_default_credentials.json`
- **Windows**: `%APPDATA%\gcloud\application_default_credentials.json`

#### Step 3: Grant Yourself Analytics Viewer Access

In Google Analytics:
1. Go to **Admin** → Select your property
2. Click **Property Access Management**
3. Add your Google account email
4. Grant **Viewer** role

#### Step 4: Test the Application

```bash
cd backend
npm install
npm run dev
```

You should see:
```
✅ GA4 Data API client initialized
   Authentication method: Application Default Credentials (gcloud auth)
   Project ID: your-project-id
```

---

### Option 2: GCP Cloud Run (Production)

#### Step 1: Create a Service Account

```bash
# Create service account
gcloud iam service-accounts create ga4-dashboard \
    --display-name="GA4 Dashboard Service Account" \
    --project=YOUR_PROJECT_ID

# Get the service account email
export SA_EMAIL=ga4-dashboard@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

#### Step 2: Grant GA4 Access

**Option A: Via Google Analytics UI**
1. Go to Google Analytics → Admin
2. Select your property
3. Click **Property Access Management**
4. Add `ga4-dashboard@YOUR_PROJECT_ID.iam.gserviceaccount.com`
5. Grant **Viewer** role

**Option B: Via gcloud (if you have GA4 Admin API access)**
```bash
# This requires GA4 Admin API permissions
gcloud analytics properties add-iam-policy-binding PROPERTY_ID \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/analytics.viewer"
```

#### Step 3: Deploy to Cloud Run

```bash
# Build and deploy
gcloud run deploy ga4-dashboard-backend \
    --source . \
    --region us-central1 \
    --service-account ${SA_EMAIL} \
    --allow-unauthenticated \
    --set-env-vars DATABASE_URL=YOUR_DB_URL,JWT_SECRET=YOUR_SECRET
```

The `--service-account` flag attaches the service account to Cloud Run, enabling Workload Identity.

---

### Option 3: GCP GKE (Kubernetes)

#### Step 1: Enable Workload Identity on GKE Cluster

```bash
# Create cluster with Workload Identity
gcloud container clusters create ga4-cluster \
    --workload-pool=YOUR_PROJECT_ID.svc.id.goog \
    --region us-central1

# Or enable on existing cluster
gcloud container clusters update CLUSTER_NAME \
    --workload-pool=YOUR_PROJECT_ID.svc.id.goog \
    --region us-central1
```

#### Step 2: Create Kubernetes Service Account

```bash
kubectl create serviceaccount ga4-dashboard-ksa \
    --namespace default
```

#### Step 3: Bind Kubernetes SA to Google SA

```bash
# Allow Kubernetes SA to impersonate Google SA
gcloud iam service-accounts add-iam-policy-binding \
    ga4-dashboard@YOUR_PROJECT_ID.iam.gserviceaccount.com \
    --role roles/iam.workloadIdentityUser \
    --member "serviceAccount:YOUR_PROJECT_ID.svc.id.goog[default/ga4-dashboard-ksa]"

# Annotate Kubernetes SA
kubectl annotate serviceaccount ga4-dashboard-ksa \
    iam.gke.io/gcp-service-account=ga4-dashboard@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

#### Step 4: Deploy to GKE

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ga4-dashboard-backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ga4-dashboard
  template:
    metadata:
      labels:
        app: ga4-dashboard
    spec:
      serviceAccountName: ga4-dashboard-ksa  # Important!
      containers:
      - name: backend
        image: gcr.io/YOUR_PROJECT_ID/ga4-dashboard-backend
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: ga4-secrets
              key: database-url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: ga4-secrets
              key: jwt-secret
```

```bash
kubectl apply -f deployment.yaml
```

---

### Option 4: AWS (via Workload Identity Federation)

#### Step 1: Create Workload Identity Pool

```bash
# Create workload identity pool
gcloud iam workload-identity-pools create aws-pool \
    --location="global" \
    --display-name="AWS Pool"

# Create AWS provider
gcloud iam workload-identity-pools providers create-aws aws-provider \
    --location="global" \
    --workload-identity-pool="aws-pool" \
    --account-id="YOUR_AWS_ACCOUNT_ID"
```

#### Step 2: Create IAM Role in AWS

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "accounts.google.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "accounts.google.com:aud": "//iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/aws-pool/providers/aws-provider"
        }
      }
    }
  ]
}
```

#### Step 3: Grant Service Account Impersonation

```bash
gcloud iam service-accounts add-iam-policy-binding \
    ga4-dashboard@YOUR_PROJECT_ID.iam.gserviceaccount.com \
    --role roles/iam.workloadIdentityUser \
    --member "principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/aws-pool/attribute.aws_role/arn:aws:sts::YOUR_AWS_ACCOUNT_ID:assumed-role/YOUR_ROLE_NAME"
```

#### Step 4: Configure Application

```bash
# Set environment variables in AWS (ECS, Lambda, etc.)
GOOGLE_IMPERSONATE_SERVICE_ACCOUNT=ga4-dashboard@YOUR_PROJECT_ID.iam.gserviceaccount.com
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
```

---

### Option 5: Azure (via Workload Identity Federation)

#### Step 1: Create Workload Identity Pool

```bash
# Create workload identity pool
gcloud iam workload-identity-pools create azure-pool \
    --location="global" \
    --display-name="Azure Pool"

# Create Azure provider
gcloud iam workload-identity-pools providers create-oidc azure-provider \
    --location="global" \
    --workload-identity-pool="azure-pool" \
    --issuer-uri="https://sts.windows.net/YOUR_AZURE_TENANT_ID/" \
    --allowed-audiences="api://AzureADTokenExchange"
```

#### Step 2: Grant Service Account Impersonation

```bash
gcloud iam service-accounts add-iam-policy-binding \
    ga4-dashboard@YOUR_PROJECT_ID.iam.gserviceaccount.com \
    --role roles/iam.workloadIdentityUser \
    --member "principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/azure-pool/attribute.sub/YOUR_AZURE_CLIENT_ID"
```

#### Step 3: Configure Azure Managed Identity

In your Azure service (App Service, Container Instances, etc.):
```bash
GOOGLE_IMPERSONATE_SERVICE_ACCOUNT=ga4-dashboard@YOUR_PROJECT_ID.iam.gserviceaccount.com
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
```

---

## 🔍 Verification

### Test Authentication

```bash
# In your backend directory
node -e "
const { verifyGA4Connection, getAuthMethod, getServiceAccountEmail } = require('./src/config/ga4');

(async () => {
  console.log('Testing GA4 authentication...\n');
  
  const isValid = await verifyGA4Connection();
  
  if (isValid) {
    console.log('\n✅ Authentication successful!');
    console.log('Method:', getAuthMethod());
    console.log('Service Account:', await getServiceAccountEmail());
  } else {
    console.log('\n❌ Authentication failed');
    process.exit(1);
  }
})();
"
```

### Test GA4 API Access

```bash
# Test fetching data from a GA4 property
node -e "
const { analyticsDataClient } = require('./src/config/ga4');

(async () => {
  try {
    const [response] = await analyticsDataClient.runReport({
      property: 'properties/YOUR_PROPERTY_ID',
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      metrics: [{ name: 'sessions' }]
    });
    
    console.log('✅ Successfully fetched GA4 data!');
    console.log('Rows returned:', response.rows?.length || 0);
  } catch (error) {
    console.error('❌ Failed to fetch GA4 data:', error.message);
  }
})();
"
```

---

## 🐛 Troubleshooting

### Error: "Could not load the default credentials"

**Local Development:**
```bash
# Re-authenticate
gcloud auth application-default login
```

**GCP Cloud Run:**
```bash
# Verify service account is attached
gcloud run services describe ga4-dashboard-backend \
    --region us-central1 \
    --format="value(spec.template.spec.serviceAccountName)"
```

**GKE:**
```bash
# Verify Workload Identity annotation
kubectl get serviceaccount ga4-dashboard-ksa -o yaml
```

### Error: "Permission denied on GA4 property"

```bash
# Verify service account has access
# Go to Google Analytics → Admin → Property Access Management
# Ensure your service account email is listed with Viewer role
```

### Error: "Project ID not found"

```bash
# Set explicit project ID
export GOOGLE_CLOUD_PROJECT=your-project-id

# Or in .env file
GOOGLE_CLOUD_PROJECT=your-project-id
```

---

## 📊 Comparison: JSON Keys vs Workload Identity

| Feature | Service Account Keys | Workload Identity |
|---------|---------------------|-------------------|
| **Security** | ❌ Long-lived credentials | ✅ Short-lived tokens |
| **Rotation** | ❌ Manual | ✅ Automatic |
| **Storage** | ❌ Must secure JSON file | ✅ No files to manage |
| **Compliance** | ❌ Violates key creation policy | ✅ Compliant |
| **Setup** | ✅ Simple | ⚠️ More complex |
| **Auditability** | ⚠️ Hard to track usage | ✅ Full audit trail |
| **Revocation** | ❌ Must delete key | ✅ Instant via IAM |

---

## 🎯 Best Practices

1. **Never use service account keys in production**
   - Use Workload Identity Federation
   - Keys should only be used for legacy systems

2. **Principle of Least Privilege**
   - Grant only `roles/analytics.viewer` on specific properties
   - Don't grant project-level permissions

3. **Use Service Account Impersonation**
   - For local development, impersonate a service account
   - Set `GOOGLE_IMPERSONATE_SERVICE_ACCOUNT` environment variable

4. **Monitor Authentication**
   - Check Cloud Audit Logs for authentication events
   - Set up alerts for failed authentication attempts

5. **Rotate Regularly**
   - Even though Workload Identity auto-rotates, review IAM bindings quarterly
   - Remove unused service accounts

---

## 📚 Additional Resources

- [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation)
- [GKE Workload Identity](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
- [Cloud Run Service Identity](https://cloud.google.com/run/docs/securing/service-identity)
- [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials)
- [GA4 Data API Authentication](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart-client-libraries)

---

## ✅ Checklist

- [ ] Installed Google Cloud SDK
- [ ] Authenticated with `gcloud auth application-default login`
- [ ] Created service account (for production)
- [ ] Granted service account Analytics Viewer role on GA4 properties
- [ ] Configured Workload Identity (GCP/AWS/Azure)
- [ ] Tested authentication with verification script
- [ ] Tested GA4 API access
- [ ] Removed any service account JSON keys
- [ ] Updated deployment configuration
- [ ] Documented service account email for team

---

**You're now using Workload Identity Federation - the secure, modern way to authenticate! 🎉**
