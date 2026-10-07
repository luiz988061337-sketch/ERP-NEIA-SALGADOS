package com.neia.pixreader.ui

import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.neia.pixreader.R
import com.neia.pixreader.services.PixNotificationListenerService
import com.neia.pixreader.services.SendEventService

class MainActivity : AppCompatActivity() {

    private static const REQUEST_NOTIFICATION_PERMISSION = 1001
    private static const TAG = "MainActivity"

    // Views
    private var tvStatus: TextView? = null
    private var tvConexao: TextView? = null
    private var tvModo: TextView? = null
    private var tvPixDetectados: TextView? = null
    private var tvEnviados: TextView? = null
    private var tvPendentes: TextView? = null
    private var tvErros: TextView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        initViews()
        checkAndRequestPermissions()
    }

    private fun initViews() {
        tvStatus = findViewById(R.id.tvStatus)
        tvConexao = findViewById(R.id.tvConexao)
        tvModo = findViewById(R.id.tvModo)
        tvPixDetectados = findViewById(R.id.tvPixDetectados)
        tvEnviados = findViewById(R.id.tvEnviados)
        tvPendentes = findViewById(R.id.tvPendentes)
        tvErros = findViewById(R.id.tvErros)

        // Configurar cliques
        findViewById(R.id.btnTestarConexao).setOnClickListener { onTestConnectionClick() }
        findViewById(R.id.btnEnviarPixTeste).setOnClickListener { onSendTestPixClick() }
        findViewById(R.id.btnVerEventos).setOnClickListener { onViewEventsClick() }
        findViewById(R.id.btnVerLogs).setOnClickListener { onViewLogsClick() }
        findViewById(R.id.btnConfiguracoes).setOnClickListener { onSettingsClick() }
    }

    private fun checkAndRequestPermissions() {
        if (ContextCompat.checkSelfPermission(this, "android.permission.FOREGROUND_SERVICE")
            != PackageManager.PERMISSION_GRANTED) {

            ActivityCompat.requestPermissions(this,
                arrayOf("android.permission.FOREGROUND_SERVICE"),
                REQUEST_NOTIFICATION_PERMISSION)
        } else {
            startNotificationService()
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        results: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, results)
        if (requestCode == REQUEST_NOTIFICATION_PERMISSION) {
            if (results.isNotEmpty() && results[0] == PackageManager.PERMISSION_GRANTED) {
                startNotificationService()
            } else {
                Toast.makeText(this, "Permissão de notificação necessária", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun startNotificationService() {
        val intent = Intent(this, PixNotificationListenerService::class.java)
        startService(intent)

        val sendIntent = Intent(this, SendEventService::class.java)
        startService(sendIntent)

        // Verificar se o listener está ativo
        checkListenerStatus()
    }

    private fun checkListenerStatus() {
        val enabled = isNotificationListenerEnabled()
        if (enabled) {
            Toast.makeText(this, "Listener de notificação ativado", Toast.LENGTH_SHORT).show()
            atualizarTela()
        } else {
            Toast.makeText(this, "Ative o listener nas configurações do sistema", Toast.LENGTH_LONG).show()
            val settingsIntent = android.provider.Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS
            startActivity(settingsIntent)
        }
    }

    private fun isNotificationListenerEnabled(): Boolean {
        val pk = android.provider.Settings.Secure.getString(
            contentResolver,
            android.provider.Settings.Secure.ENABLED_NOTIFICATION_LISTENERS
        )
        if (pk.isNotEmpty()) {
            val names = pk.split(":")
            for (i in names.indices if i + 1 < names.size) {
                if (names[i] == packageName && names[i + 1] == "com.neia.pixreader.services.PixNotificationListenerService") {
                    return true
                }
            }
        }
        return false
    }

    private fun atualizarTela() {
        // Atualizar UI com status atual
        tvStatus?.text = "🟢 SERVIÇO ATIVO"
        tvConexao?.text = "🟢 ONLINE"
        tvModo?.text = "🧪 TESTE"
        tvPixDetectados?.text = "12"
        tvEnviados?.text = "11"
        tvPendentes?.text = "1"
        tvErros?.text = "0"
    }

    fun onTestConnectionClick(view: View) {
        // Testar conexão com API
        Toast.makeText(this, "Testando conexão com API...", Toast.LENGTH_SHORT).show()
        // TODO: Implementar teste de conexão real
    }

    fun onSendTestPixClick(view: View) {
        // Enviar PIX teste
        // Criar evento de teste e enviar
        val event = mapOf(
            "event_hash" to "test_001_${System.currentTimeMillis()}",
            "source_app" to "Néia Pix Reader Android",
            "notification_title" to "Pix recebido",
            "notification_text" to "Recebi R$ 50,00 - referência: TEST-001",
            "amount" to 50.00,
            "sender_name" to "Cliente Teste",
            "reference" to "TEST-001",
            "detected_at" to System.currentTimeMillis(),
            "received_at" to System.currentTimeMillis(),
            "environment" to "TEST"
        )

        val gson = com.google.gson.Gson()
        val eventJson = gson.toJson(event)

        val sendIntent = Intent(this, SendEventService::class.java)
        sendIntent.putExtra("event_data", eventJson)
        startService(sendIntent)

        Toast.makeText(this, "PIX de teste enviado!", Toast.LENGTH_SHORT).show()
    }

    fun onViewEventsClick(view: View) {
        // Ver eventos
        val events = DatabaseHelper(this).getOfflineEvents()
        val eventList = events.joinToString("\n") { "${it["event_hash"] ?: "sem hash"} - ${it["source_app"] ?: "sem app"}".take(30) }
        Toast.makeText(this, "Eventos: $eventList", Toast.LENGTH_LONG).show()
        // TODO: Implementar tela de eventos
    }

    fun onViewLogsClick(view: View) {
        // Ver logs
        Toast.makeText(this, "Ver logs...", Toast.LENGTH_SHORT).show()
        // TODO: Implementar visualização de logs
    }

    fun onSettingsClick(view: View) {
        // Configurações
        val settingsIntent = android.content.Intent(android.provider.Settings.ACTION_APP_DETAILS_SETTINGS)
        val packageName = this.packageName
        settingsIntent.data = android.net.Uri.fromParts("package", packageName, null)
        startActivity(settingsIntent)
    }
}