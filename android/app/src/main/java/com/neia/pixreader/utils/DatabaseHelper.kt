package com.neia.pixreader.utils

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.util.Log
import com.google.gson.Gson

const val DB_NAME = "neia_pix_reader.db"
const val DB_VERSION = 1

// Tabela de eventos offline
const val TABLE_OFFLINE_EVENTS = "offline_events"

// Colunas da tabela offline events
const val COL_ID = "id"
const val COL_EVENT_DATA = "event_data"
const val COL_CREATED_AT = "created_at"
const val COL_RETRY_COUNT = "retry_count"
const val COL_LAST_SENT = "last_sent"

class DatabaseHelper(context: Context) : SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {

    override fun onCreate(db: SQLiteDatabase) {
        val createTable = """
            CREATE TABLE $TABLE_OFFLINE_EVENTS (
                $COL_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                $COL_EVENT_DATA TEXT NOT NULL,
                $COL_CREATED_AT INTEGER NOT NULL,
                $COL_RETRY_COUNT INTEGER NOT NULL DEFAULT 0,
                $COL_LAST_SENT INTEGER
            )
        """.trimIndent()

        db.execSQL(createTable)
        Log.d("DatabaseHelper", "Table offline_events created")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        Log.w("DatabaseHelper", "Upgrading database from $oldVersion to $newVersion")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_OFFLINE_EVENTS")
        onCreate(db)
    }

    fun insertOfflineEvent(event: Map<String, Any?>, createdAt: Long): Long {
        val values = ContentValues().apply {
            put(COL_EVENT_DATA, gson.toJson(event))
            put(COL_CREATED_AT, createdAt)
            put(COL_RETRY_COUNT, 0)
        }
        return readableDatabase.insert(TABLE_OFFLINE_EVENTS, null, values)
    }

    fun getOfflineEvents(): List<Map<String, Any?>> {
        val events = mutableListOf<Map<String, Any?>>()
        val cursor = readableDatabase.query(
            TABLE_OFFLINE_EVENTS,
            null,
            null,
            null,
            null,
            null,
            "$COL_CREATED_AT DESC"
        )

        try {
            if (cursor.moveToFirst()) {
                do {
                    val eventJson = cursor.getString(cursor.getColumnIndexOrThrow(COL_EVENT_DATA))
                    val eventMap = gson.fromJson(eventJson, Map::class.java::class.java)
                    events.add(eventMap)
                } while (cursor.moveToNext())
            }
        } finally {
            cursor.close()
        }
        return events
    }

    fun updateRetryCount(eventId: Long, retryCount: Int, lastSent: Long?) {
        val values = ContentValues().apply {
            put(COL_RETRY_COUNT, retryCount)
            if (lastSent != null) {
                put(COL_LAST_SENT, lastSent)
            }
        }
        val selection = "$COL_ID = ?"
        val selectionArgs = arrayOf(eventId.toString())
        writableDatabase.update(TABLE_OFFLINE_EVENTS, values, selection, selectionArgs)
    }

    fun deleteSentEvent(eventId: Long) {
        val selection = "$COL_ID = ?"
        val selectionArgs = arrayOf(eventId.toString())
        writableDatabase.delete(TABLE_OFFLINE_EVENTS, selection, selectionArgs)
    }

    val gson: Gson = Gson()
}