package com.neia.pixreader.services

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log
import com.google.gson.Gson
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class SendEventService : Service() {

    private lateinit var okHttpClient: OkHttpClient
    private var retryCount = 0
    private const val MAX_RETRIES = 3

    override fun onCreate() {
        super.onCreate()
        okHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
            .writeTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
            .build()
        Log.d("SendEventService", "SendEventService onCreate")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent != null) {
            val eventJson = intent.getStringExtra("event_data")
            if (eventJson != null) {
                val gson = Gson()
                val event = gson.fromJson(eventJson, Map::class.java::class.java)
                sendEvent(event)
            }
        }
        return START_STICKY
    }

    private fun sendEvent(event: Map<String, Any?>) {
        val thread = Thread {
            try {
                val json = gson.toJson(event)
                val mediaType = "application/json".toMediaType()
                val body = json.toRequestBody(mediaType)

                val request = Request.Builder()
                    .url("https://supabase-project-ref.supabase.co/functions/v1/pix-notification")
                    .post(body)
                    .addHeader("Authorization", "Bearer service_role_key_placeholder")
                    .addHeader("Content-Type", "application/json")
                    .build()

                val response = okHttpClient.newCall(request).execute()

                if (response.isSuccessful) {
                    Log.d("SendEventService", "Event sent successfully: ${response.body?.string()}")
                    retryCount = 0
                } else {
                    Log.w("SendEventService", "API responded with code: ${response.code}")
                    handleRetry()
                }
            } catch (e: Exception) {
                Log.e("SendEventService", "Error sending event", e)
                handleRetry()
            }
        }
        thread.start()
        return START_STICKY
    }

    private fun handleRetry() {
        if (retryCount < MAX_RETRIES) {
            retryCount++
            val delay = 1000 * (2 ^ retryCount) // Exponential backoff: 2s, 4s, 8s
            Log.d("SendEventService", "Scheduling retry $retryCount after ${delay}ms")
            // TODO: Implementar agendamento real ou fila local
            Thread.sleep(delay)
            // Tentar novamente
        } else {
            Log.e("SendEventService", "Max retries reached, storing offline")
            // TODO: Armazenar na fila offline
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d("SendEventService", "SendEventService onDestroy")
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }
}