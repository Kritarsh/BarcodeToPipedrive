# Environment Variables Setup for Render

## Frontend Service (React App)

In your Render frontend service dashboard:

1. Go to **Environment** tab
2. Add this environment variable:
   - **Key**: `REACT_APP_API_URL`
   - **Value**: `https://your-backend-service-name.onrender.com`
   
   Replace `your-backend-service-name` with your actual backend service name from Render.

## Backend Service (Node.js/Express)

In your Render backend service dashboard:

1. Go to **Environment** tab
2. Add any necessary environment variables like:
   - `MONGODB_URI` (your MongoDB connection string)
   - `UPC_API_KEY` (if you have one)
   - `PORT` (usually auto-set by Render to 10000)

## Important Notes

- Environment variables starting with `REACT_APP_` are automatically included in the React build
- The frontend `REACT_APP_API_URL` should point to your backend's public URL
- After adding environment variables, you'll need to redeploy both services
- Make sure both services are deployed and running before testing

## Example URLs

If your services are named:
- Frontend: `my-inventory-frontend`
- Backend: `my-inventory-backend`

Then set:
- Frontend `REACT_APP_API_URL`: `https://my-inventory-backend.onrender.com`
- Frontend will be accessible at: `https://my-inventory-frontend.onrender.com`
