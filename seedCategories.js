const admin = require('firebase-admin');
require('dotenv').config();

// Parse Firebase Service Account from .env
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (e) {
  console.error("FIREBASE_SERVICE_ACCOUNT environment variable is not valid JSON.");
  process.exit(1);
}

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const categories = [
  // ─── MAIN CATEGORIES ────────────────────────────────────────────────────────
  {
    id: 'kiyim_kechak',
    name: 'Kiyim-kechak',
    gender: 'unisex',
    isPopular: true,
    parentId: null,
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/3159/3159614.png'
  },
  {
    id: 'avto_qismlar',
    name: 'Avto ehtiyot qismlari',
    gender: 'unisex',
    isPopular: true,
    parentId: null,
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/1971/1971053.png'
  },
  {
    id: 'xojalik_mollari',
    name: "Xo'jalik mollari",
    gender: 'unisex',
    isPopular: true,
    parentId: null,
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/2821/2821812.png'
  },
  {
    id: 'kitob_kanselyariya',
    name: 'Kitob va Aksessuarlar',
    gender: 'unisex',
    isPopular: true,
    parentId: null,
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/3145/3145765.png'
  },
  {
    id: 'diniy_buyumlar',
    name: 'Diniy buyumlar',
    gender: 'unisex',
    isPopular: true,
    parentId: null,
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/3853/3853181.png'
  },
  {
    id: 'elektronika',
    name: 'Elektronika',
    gender: 'unisex',
    isPopular: true,
    parentId: null,
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/1261/1261143.png'
  },
  {
    id: 'gozallik_salomatlik',
    name: 'Go\'zallik va salomatlik',
    gender: 'female',
    isPopular: true,
    parentId: null,
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/3253/3253136.png'
  },
  {
    id: 'uy_bog',
    name: 'Uy va bog\'',
    gender: 'unisex',
    isPopular: true,
    parentId: null,
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/2558/2558063.png'
  },
  
  // ─── SUBCATEGORIES FOR CLOTHING ───────────────────────────────────────────
  {
    id: 'ayollar_kiyimi',
    name: 'Ayollar kiyimi',
    gender: 'female',
    isPopular: false,
    parentId: 'kiyim_kechak',
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/1785/1785348.png'
  },
  {
    id: 'erkaklar_kiyimi',
    name: 'Erkaklar kiyimi',
    gender: 'male',
    isPopular: false,
    parentId: 'kiyim_kechak',
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/2806/2806141.png'
  },
  {
    id: 'bolalar_kiyimi',
    name: 'Bolalar kiyimi',
    gender: 'unisex',
    isPopular: false,
    parentId: 'kiyim_kechak',
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/3159/3159614.png' // generic
  },
  {
    id: 'poyabzallar',
    name: 'Poyabzallar',
    gender: 'unisex',
    isPopular: false,
    parentId: 'kiyim_kechak',
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/2589/2589994.png'
  }
];

async function seed() {
  console.log('Starting category seed...');
  let count = 0;
  
  for (const cat of categories) {
    const docRef = db.collection('categories').doc(cat.id);
    await docRef.set({
      name: cat.name,
      gender: cat.gender,
      isPopular: cat.isPopular,
      parentId: cat.parentId,
      imageUrl: cat.imageUrl
    }, { merge: true });
    console.log(`✅ Seeded category: ${cat.name}`);
    count++;
  }
  
  console.log(`\n🎉 Successfully seeded ${count} categories!`);
  process.exit(0);
}

seed();
