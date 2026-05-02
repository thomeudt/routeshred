#!bin/bash

# Install all dependencies
echo "Installing bike-route-planner dependencies..."
npm install
npm install --workspace=frontend
npm install --workspace=backend

echo "✅ Installation complete!"
echo ""
echo "Start development with:  npm run dev"
echo "Start production with:   npm start"
echo ""
echo "Frontend will be available at: http://localhost:3000"
echo "Backend will be available at: http://localhost:5000"
