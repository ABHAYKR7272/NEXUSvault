require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('./models/User');
const Document = require('./models/Document');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');
  await User.deleteMany({});
  await Document.deleteMany({});

  const aarav = await User.create({
    name: 'Aarav Mehta', email: 'aarav@nexusvault.io', password: 'password123',
    title: 'Lead Engineer', department: 'Engineering', location: 'Bengaluru, IN',
    bio: 'Building reliable systems. Loves clean architecture.',
    skills: ['Node.js','React','MongoDB','System Design'],
    avatarColor: '#6366f1'
  });
  const rahul = await User.create({
    name: 'Rahul Sharma', email: 'rahul@nexusvault.io', password: 'password123',
    title: 'Frontend Developer', department: 'Engineering', location: 'Pune, IN',
    bio: 'UI/UX enthusiast. Tailwind & motion design.',
    skills: ['React','Tailwind','TypeScript'],
    avatarColor: '#22d3ee'
  });
  const priya = await User.create({
    name: 'Priya Patel', email: 'priya@nexusvault.io', password: 'password123',
    title: 'Product Designer', department: 'Design', location: 'Mumbai, IN',
    bio: 'Designing delightful product experiences.',
    skills: ['Figma','UX Research','Prototyping'],
    avatarColor: '#ec4899'
  });

  // Public document
  await Document.create({
    title: 'NEXUSvault API Documentation',
    description: 'Complete REST API reference for the NEXUSvault platform.',
    category: 'Technical', owner: aarav._id, ownerName: aarav.name,
    visibility: 'public', tags: ['api','docs','reference'],
    versions: [{
      versionNumber: '1.0', message: 'Initial docs',
      content: '# NEXUSvault API\n\nBase URL: http://localhost:5000/api\n\n## Auth\nPOST /auth/login\nPOST /auth/register\n\n## Documents\nGET /documents\nPOST /documents',
      uploadedBy: aarav._id, uploaderName: aarav.name
    }]
  });

  // Private project — Rahul is head
  const code = Document.generateCode();
  await Document.create({
    title: 'E-Commerce Platform',
    description: 'Full-stack e-commerce project. Internal team only.',
    category: 'Technical', owner: rahul._id, ownerName: rahul.name,
    visibility: 'private', accessCode: code,
    tags: ['react','nodejs','project'],
    versions: [{
      versionNumber: '1.0', message: 'Initial upload',
      isProject: true,
      projectTree: [
        { name: 'src', type: 'folder', path: 'src', children: [
          { name: 'App.jsx', type: 'file', path: 'src/App.jsx', content: 'import React from "react";\n\nfunction App() {\n  return <div>E-Commerce App</div>;\n}\n\nexport default App;', mimeType: 'text/plain' },
          { name: 'index.js', type: 'file', path: 'src/index.js', content: 'import React from "react";\nimport ReactDOM from "react-dom";\nimport App from "./App";\n\nReactDOM.render(<App />, document.getElementById("root"));', mimeType: 'text/plain' }
        ]},
        { name: 'package.json', type: 'file', path: 'package.json', content: '{\n  "name": "ecommerce",\n  "version": "1.0.0",\n  "dependencies": {\n    "react": "^18.0.0"\n  }\n}', mimeType: 'application/json' },
        { name: 'README.md', type: 'file', path: 'README.md', content: '# E-Commerce Platform\n\nA full-stack e-commerce application built with React and Node.js.', mimeType: 'text/plain' }
      ],
      uploadedBy: rahul._id, uploaderName: rahul.name
    }]
  });

  console.log('\nSeed complete!');
  console.log('========================================');
  console.log('  Aarav  -> aarav@nexusvault.io  / password123');
  console.log('  Rahul  -> rahul@nexusvault.io  / password123  (head of E-Commerce Platform)');
  console.log('  Priya  -> priya@nexusvault.io  / password123');
  console.log(`\n  Private Project Code: ${code}`);
  console.log('========================================\n');
  process.exit(0);
}
seed().catch(e => { console.error('Seed failed:', e.message); process.exit(1); });
