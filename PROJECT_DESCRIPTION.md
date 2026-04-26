# NEXUSvault — Project Description

## 🔐 Overview
**NEXUSvault** ek secure, collaborative document & project version-control platform hai jo files aur full project folders (ZIPs) ko safely store, share aur compare karne ke liye banaya gaya hai. Yeh Google Drive jaisi simplicity aur GitHub jaisi version-comparison power ko ek hi minimal interface me combine karta hai.

## 🎯 Core Idea
Har project ya document ek unique **6-digit Access Code** ke through identify hota hai. Owner project ko **public** ya **private** rakh sakta hai, aur dusre users sirf valid code aur (private hone par) permission ke saath hi join kar sakte hain.

## ✨ Key Features

### 📁 Smart Document Management
- Single files (PDF, DOCX, images, code, etc.) ya complete **ZIP projects** upload karne ki suvidha
- Har upload ek nayi **version** ke roop me save hoti hai — purani versions kabhi delete nahi hoti
- Owner version history dekh sakta hai, rollback kar sakta hai aur metadata manage kar sakta hai

### 🔍 Intelligent Search & Join
- Real-time **incremental search** — ek-do letter type karte hi matching projects (public + private) turant dikhne lagte hain
- Search results clickable hain; selection hote hi 6-digit access code input automatically focus ho jata hai
- Private projects ke liye access request workflow

### 🔄 Side-by-Side Version Comparison
NEXUSvault ka sabse powerful feature:
- **Single files** ka line-by-line diff (added / removed / modified lines clearly highlighted)
- **ZIP projects** ke liye synchronized **tree comparison** — dono versions ke folder structures side-by-side
- **Folder sync**: ek side me folder open/close karte hi dusri side ka same folder bhi automatically toggle hota hai
- **Visual diff indicators**:
  - 🟢 Green — added files/folders
  - 🔴 Red (strikethrough) — removed
  - 🟡 Yellow — modified
  - ⚪ Grey — unchanged
- **Change indicators on folders**: jis folder ke andar changes hain uspar coloured dots, badge count aur subtle highlight — taaki turant pata chale kaha jaake dekhna hai
- Kisi bhi file pe click karke uska deep line-level diff dekho

### 👥 Authentication & Access Control
- JWT-based secure login & signup
- Public / Private visibility modes
- Per-project access codes
- Owner-controlled permissions

### 🎨 Clean, Modern UI
- Dark, minimalist single-page interface
- Smooth dialogs for upload, join, compare aur version history
- Responsive aur fast — sab kuch ek hi page pe, bina reloads ke

## 🛠️ Tech Stack
- **Backend**: Node.js + Express, MongoDB (Mongoose), JWT auth, Multer uploads, `diff` library for comparisons
- **Frontend**: Vanilla HTML/CSS/JS — single `index.html` SPA, served directly by the backend
- **Deployment**: Backend serves frontend statically — bas `npm start` chalao aur `http://localhost:5000` pe full app ready

## 🚀 Use Cases
- Developers jo apne project ke alag-alag versions compare karna chahte hain
- Teams jo documents collaboratively manage aur version-track karna chahte hain
- Students / writers jo apne drafts ka history aur changes track karna chahte hain
- Anyone jo Google Drive + Git ki simplicity ek jagah chahta hai

## 💡 What Makes It Unique
NEXUSvault sirf ek storage tool nahi hai — yeh ek **version-aware collaboration vault** hai. Code-level diff ki precision aur drive-level ki ease — dono ek saath, ek beautifully simple interface me.
