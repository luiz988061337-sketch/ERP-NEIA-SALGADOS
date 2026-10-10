package com.neia.pixreader.services

import android.app.Service
import android.content.Intent
 android.content.Context
import android.os.IBinder
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.google.gson.Gson
import com.neia.pixreader.ui.MainActivity
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

class PixNotificationListenerService : Service() {

    private lateinit var mainActivity: MainActivity
    private var retryCount = 0
    private var lastRetryTime = 0L

    override fun onCreate() {
        super.onCreate()
        Log.d("PixListener", "PixNotificationListenerService onCreate")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent != null) {
            processNotificationIntent(intent)
        }
        return START_STICKY
    }

    private fun processNotificationIntent(intent: Intent) {
        try {
            notificationTitle = intent.getStringExtra("android.title")
            notificationText = intent.getStringExtra("android.text")
            sbn = intent.getParcelableExtra("android.notification") as android.app.StatusBarNotification?

            if (notificationText != null && notificationTitle != null) {
                Log.d("PixListener", "Notification received: $notificationTitle - $notificationText")

                // Verificar se listener está autorizado
                if (!isDeviceAuthorized()) {
                    Log.w("PixListener", "Device not authorized")
                    return
                }

                // Filtrar se é Pix
                if (!isPixRelated()) {
                    Log.d("PixListener", "Notification not related to Pix, ignoring")
                    return
                }

                // Extrair dados
                val event = extractPixData()

                // Gerar hash para dedup
                val hash = generateHash(event)

                // Verificar duplicidade local
                if (isDuplicateHash(hash)) {
                    Log.d("PixListener", "Duplicate event detected, ignoring")
                    return
                }

                // Salvar hash como duplicado
                saveHash(hash)

                // Enviar para API
                sendEventToApi(event)
            }
        } catch (e: Exception) {
            Log.e("PixListener", "Error processing notification", e)
        }
        return START_STICKY
    }

    companion object {
        private var notificationTitle: String? = null
        private var notificationText: String? = null
        private var sbn: android.app.StatusBarNotification? = null

        fun resetData() {
            notificationTitle = null
            notificationText = null
            sbn = null
        }
    }

    private fun isDeviceAuthorized(): Boolean {
        // Verificar se o dispositivo está na lista de dispositivos autorizados
        // TODO: Implementar consulta ao Supabase para verificar device_id
        val deviceIdentifier = android.provider.Settings.Secure.getString(
            applicationContext.contentResolver,
            android.provider.Settings.Secure.ANDROID_ID
        )
        // TODO: Verificar no banco de dados se este device está autorizado
        return true // Placeholder - em produção verificaria no banco
    }

    private fun isPixRelated(): Boolean {
        // Palavras configuráveis que indicam Pix
        val pixKeywords = listOf("Pix", "PIX", "recebido", "recebimento", "pagamento recebido", "transferência recebida")
        val combined = "$notificationTitle $notificationText".toUpperCase()

        for (keyword in pixKeywords) {
            if (combined.contains(keyword.upperCase())) {
                return true
            }
        }

        // Classificar como POSSIVEL_PIX primeiro
        // Nunca assumir automaticamente que toda notificação contendo "Pix" representa pagamento válido
        return combined.contains("PIX") || combined.contains("RECEBIDO")
    }

    private fun extractPixData(): Map<String, Any?> {
        // Extrair dados da notificação
        val title = notificationTitle ?: ""
        val text = notificationText ?: ""

        // Extrair valor - procurar por padrão R$ XXX,XX ou R$ XXX
        val amountPattern = """R\$\s*[\d.,]+"""
        val amountMatch = text.match(amountPattern)

        val amount: Double?
        if (amountMatch != null) {
            val amountStr = amountMatch[0].replace("R$", "").replace(" ", "").replace(".", "").replace(",", ".")
            amount = amountStr.toDoubleOrNull()
        } else {
            amount = null
        }

        // Extrair referência - procurar por padrões de referência/ID
        val referencePattern = """(?i)(?:referência|ref|COD[-\s]???[#]?\s*[A-Z0-9]+)""".trimMargin()
        val referenceMatch = text.match(referencePattern)

        // Extrair nome do remetente
        val senderNamePattern = """(?i)(de|enviado por)\s+([A-Za-z0-9\s]+)""".trimMargin()
        val senderMatch = text.match(senderNamePattern)
        val senderName = senderMatch?.getValue(2) ?: ""

        // Detectar horário
        val detectedAt = System.currentTimeMillis()

        return mapOf(
            "event_hash" to generateHashContent(title, text, detectedAt),
            "source_app" to "Néia Pix Reader Android",
            "bank_name" to null,
            "notification_title" to title,
            "notification_text" to text,
            "amount" to amount,
            "sender_name" to senderName,
            "reference" to referenceMatch?.value ?: "",
            "detected_at" to detectedAt,
            "received_at" to System.currentTimeMillis(),
            "processed_at" to null,
            "status" to "PENDING",
            "environment" to "TEST",
            "device_id" to android.provider.Settings.Secure.getString(
                applicationContext.contentResolver,
                android.provider.Settings.Secure.ANDROID_ID
            )
        )
    }

    private fun generateHashContent(title: String, text: String, detectedAt: Long): String {
        // SHA-256(source_app + notification_title + notification_text + detected_at)
        val sourceApp = "Néia Pix Reader Android"
        val input = "$sourceApp$title$text$detectedAt"
        return sha256(input)
    }

    private fun sha256(input: String): String {
        try {
            val digest = MessageDigest.getInstance("SHA-256")
            val hash = digest.digest(input.toByteArray())
            return hash.joinToString("") { "%02x".format(it) }
        } catch (e: Exception) {
            Log.e("PixListener", "Error generating hash", e)
            return java.util.UUID.randomUUID().toString()
        }
    }

    private fun isDuplicateHash(hash: String): Boolean {
        // TODO: Verificar no banco de dados se este hash já existe
        // Por enquanto, usar memória simples com limite
        val now = System.currentTimeMillis()
        // Limpar hashes antigos (mais de 24h)
        // TODO: Implementar storage persistente
        return false // Placeholder
    }

    private fun saveHash(hash: String) {
        // TODO: Salvar hash no banco/local storage para dedup
        Log.d("PixListener", "Saved hash: $hash")
    }

    private fun sendEventToApi(event: Map<String, Any?>) {
        // Verificar se há conexão com internet
        // TODO: Implementar connectivity check

        // Tentar enviar com retry
        val maxRetries = 3
        val retryDelay = 1000L // 1 segundo

        val success = trySendEvent(event)

        if (!success && retryCount < maxRetries) {
            val now = System.currentTimeMillis()
            if (now - lastRetryTime > retryDelay * 1000) {
                retryCount++
                lastRetryTime = now
                // Exponential backoff
                Thread.sleep(retryDelay * 1000 * retryCount)
                trySendEvent(event)
            }
        }
    }

    private fun trySendEvent(event: Map<String, Any?>): Boolean {
        try {
            // TODO: Implementar chamada para a Edge Function pix-notification
            // Usar OkHttp ou similar
            val url = "https://${BuildConfig.SUPABASE_PROJECT}.supabase.co/functions/v1/pix-notification"

            // TODO: Construir JSON e fazer POST
            Log.d("PixListener", "Sending event to API: ${event["event_hash"]}")
            // Simular sucesso para desenvolvimento
            retryCount = 0
            return true
        } catch (e: Exception) {
            Log.e("PixListener", "Error sending event to API", e)
            return false
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d("PixListener", "PixNotificationListenerService onDestroy")
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }
}