package com.chronosforge.studio

import android.annotation.SuppressLint
import android.bluetooth.*
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.topstep.fitcloud.sdk.v2.FcSDK
import com.topstep.fitcloud.sdk.v2.dfu.FcDfuManager
import com.topstep.fitcloud.sdk.v2.model.config.FcDeviceInfo
import io.reactivex.rxjava3.android.schedulers.AndroidSchedulers
import io.reactivex.rxjava3.disposables.CompositeDisposable
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

@SuppressLint("MissingPermission")
class NativeWatchBridge(
    private val context: Context,
    private val webView: WebView
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val disposables = CompositeDisposable()
    private val fcSDK: FcSDK = FcSDK.Builder(context.applicationContext).build()
    private var dfuManager: FcDfuManager? = null
    private var connectedMac: String? = null
    private var rawGatt: BluetoothGatt? = null

    init {
        dfuManager = FcDfuManager(context.applicationContext, fcSDK)
    }

    private fun emitToWeb(eventName: String, payloadJson: String) {
        mainHandler.post {
            val escaped = payloadJson.replace("\\", "\\\\").replace("'", "\\'")
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('$eventName', { detail: JSON.parse('$escaped') }));",
                null
            )
        }
    }

    /** 1. Scan nearby watches just like the original FitCloudPro app */
    @JavascriptInterface
    fun scanWatches() {
        val scanSub = fcSDK.scanner.scan(15_000L)
            .observeOn(AndroidSchedulers.mainThread())
            .subscribe({ result ->
                val obj = JSONObject().apply {
                    put("name", result.device.name ?: "Unknown Watch")
                    put("mac", result.device.address)
                    put("rssi", result.rssi)
                }
                emitToWeb("native-watch-found", obj.toString())
            }, { err ->
                emitToWeb("native-watch-error", JSONObject().put("message", err.message).toString())
            })
        disposables.add(scanSub)
    }

    /** 2. Pair/Connect via FitCloudPro protocol + read exact hardware LCD resolution */
    @JavascriptInterface
    fun connectFitCloudWatch(macAddress: String) {
        connectedMac = macAddress
        fcSDK.connector.connect(macAddress)

        val stateSub = fcSDK.connector.observerConnectorState()
            .observeOn(AndroidSchedulers.mainThread())
            .subscribe({ state ->
                val info: FcDeviceInfo? = fcSDK.deviceInfoAbility.getDeviceInfo()
                val res = JSONObject().apply {
                    put("state", state.name)
                    put("mac", macAddress)
                    put("lcdWidth", info?.lcdWidth ?: 466)
                    put("lcdHeight", info?.lcdHeight ?: 466)
                    put("isRound", info?.isRound ?: true)
                    put("dialType", info?.dialType ?: 0)
                }
                emitToWeb("native-watch-state", res.toString())
            }, { err ->
                emitToWeb("native-watch-error", JSONObject().put("message", err.message).toString())
            })
        disposables.add(stateSub)
    }

    /** 3. Dump complete Raw GATT Services, Characteristics, and Write Permissions */
    @JavascriptInterface
    fun inspectRawGatt(macAddress: String) {
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        val device = manager.adapter.getRemoteDevice(macAddress)
        rawGatt?.close()
        rawGatt = device.connectGatt(context, false, object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    gatt.discoverServices()
                }
            }

            override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                val servicesArray = JSONArray()
                for (service in gatt.services) {
                    val charsArray = JSONArray()
                    for (ch in service.characteristics) {
                        val props = ch.properties
                        charsArray.put(JSONObject().apply {
                            put("uuid", ch.uuid.toString())
                            put("read", (props and BluetoothGattCharacteristic.PROPERTY_READ) != 0)
                            put("write", (props and BluetoothGattCharacteristic.PROPERTY_WRITE) != 0)
                            put("writeNoResp", (props and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0)
                            put("notify", (props and BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0)
                        })
                    }
                    servicesArray.put(JSONObject().apply {
                        put("serviceUuid", service.uuid.toString())
                        put("characteristics", charsArray)
                    })
                }
                emitToWeb("native-raw-gatt", servicesArray.toString())
            }
        }, BluetoothDevice.TRANSPORT_LE)
    }

    /** 4. Official WatchFace DFU Push — makes the watch accept full analog/digital .bin dials */
    @JavascriptInterface
    fun pushFitCloudBin(base64Data: String) {
        try {
            val cleanBase64 = base64Data.substringAfter(",")
            val binBytes = Base64.decode(cleanBase64, Base64.DEFAULT)
            val dialFile = File(context.cacheDir, "chronos_custom_dial.bin")
            FileOutputStream(dialFile).use { it.write(binBytes) }

            val dfu = dfuManager ?: throw IllegalStateException("FcDfuManager not initialized")
            val dfuSub = dfu.start(FcDfuManager.DfuType.DIAL, dialFile, 0)
                .observeOn(AndroidSchedulers.mainThread())
                .subscribe({ progress ->
                    val status = JSONObject().apply {
                        put("state", progress.state.name)
                        put("percent", progress.progress)
                        put("bytesSent", (binBytes.size * progress.progress) / 100)
                        put("totalBytes", binBytes.size)
                    }
                    emitToWeb("native-dfu-progress", status.toString())
                }, { err ->
                    emitToWeb("native-watch-error", JSONObject().put("message", "DFU Failed: ${err.message}").toString())
                }, {
                    emitToWeb("native-dfu-complete", JSONObject().put("installed", true).toString())
                })
            disposables.add(dfuSub)
        } catch (e: Exception) {
            emitToWeb("native-watch-error", JSONObject().put("message", e.message).toString())
        }
    }

    /** 5. Native VeryFit / IDO (0x0AF0) D1 Watch Face Push */
    @JavascriptInterface
    fun pushVeryFitIwf(base64Data: String, macAddress: String) {
        val serviceUuid = UUID.fromString("00000af0-0000-1000-8000-00805f9b34fb")
        val writeUuid = UUID.fromString("00000af6-0000-1000-8000-00805f9b34fb")
        val notifyUuid = UUID.fromString("00000af7-0000-1000-8000-00805f9b34fb")

        val payload = Base64.decode(base64Data.substringAfter(","), Base64.DEFAULT)
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        val device = manager.adapter.getRemoteDevice(macAddress)

        device.connectGatt(context, false, object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    gatt.requestMtu(247)
                }
            }
            override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
                gatt.discoverServices()
            }
            override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                val service = gatt.getService(serviceUuid) ?: return
                val writeChar = service.getCharacteristic(writeUuid) ?: return
                val notifyChar = service.getCharacteristic(notifyUuid)
                if (notifyChar != null) {
                    gatt.setCharacteristicNotification(notifyChar, true)
                }
                Thread {
                    val chunkSize = 180
                    var offset = 0
                    while (offset < payload.size) {
                        val end = minOf(offset + chunkSize, payload.size)
                        writeChar.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                        writeChar.value = payload.copyOfRange(offset, end)
                        gatt.writeCharacteristic(writeChar)
                        offset = end
                        val pct = (offset * 100) / payload.size
                        emitToWeb("native-dfu-progress", JSONObject().put("percent", pct).toString())
                        Thread.sleep(18)
                    }
                    emitToWeb("native-dfu-complete", JSONObject().put("installed", true).toString())
                }.start()
            }
        }, BluetoothDevice.TRANSPORT_LE)
    }
}
