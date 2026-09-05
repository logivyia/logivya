package com.logivya.mobile

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.StandardIntegrityManager

class PlayIntegrityModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val integrityManager = IntegrityManagerFactory.createStandard(reactContext.applicationContext)

  @Volatile
  private var tokenProvider: StandardIntegrityManager.StandardIntegrityTokenProvider? = null

  override fun getName(): String = "PlayIntegrity"

  @ReactMethod
  fun prepare(promise: Promise) {
    val existing = tokenProvider
    if (existing != null) {
      promise.resolve(null)
      return
    }

    prepareProvider(
      onSuccess = { promise.resolve(null) },
      onFailure = { error -> reject(promise, "PLAY_INTEGRITY_PREPARE_FAILED", error) },
    )
  }

  @ReactMethod
  fun requestToken(requestHash: String, promise: Promise) {
    if (!requestHash.matches(Regex("^[A-Za-z0-9_-]{16,500}$"))) {
      promise.reject("PLAY_INTEGRITY_INVALID_HASH", "The request hash is invalid.")
      return
    }

    val existing = tokenProvider
    if (existing != null) {
      requestWithProvider(existing, requestHash, promise, retryWithFreshProvider = true)
      return
    }

    prepareProvider(
      onSuccess = { provider ->
        requestWithProvider(provider, requestHash, promise, retryWithFreshProvider = false)
      },
      onFailure = { error -> reject(promise, "PLAY_INTEGRITY_PREPARE_FAILED", error) },
    )
  }

  private fun prepareProvider(
    onSuccess: (StandardIntegrityManager.StandardIntegrityTokenProvider) -> Unit,
    onFailure: (Exception) -> Unit,
  ) {
    integrityManager
      .prepareIntegrityToken(
        StandardIntegrityManager.PrepareIntegrityTokenRequest.builder()
          .setCloudProjectNumber(BuildConfig.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER)
          .build(),
      )
      .addOnSuccessListener { provider ->
        tokenProvider = provider
        onSuccess(provider)
      }
      .addOnFailureListener { error -> onFailure(error) }
  }

  private fun requestWithProvider(
    provider: StandardIntegrityManager.StandardIntegrityTokenProvider,
    requestHash: String,
    promise: Promise,
    retryWithFreshProvider: Boolean,
  ) {
    provider
      .request(
        StandardIntegrityManager.StandardIntegrityTokenRequest.builder()
          .setRequestHash(requestHash)
          .build(),
      )
      .addOnSuccessListener { response -> promise.resolve(response.token()) }
      .addOnFailureListener { error ->
        tokenProvider = null
        if (!retryWithFreshProvider) {
          reject(promise, "PLAY_INTEGRITY_TOKEN_FAILED", error)
          return@addOnFailureListener
        }

        prepareProvider(
          onSuccess = { freshProvider ->
            requestWithProvider(freshProvider, requestHash, promise, retryWithFreshProvider = false)
          },
          onFailure = { prepareError -> reject(promise, "PLAY_INTEGRITY_PREPARE_FAILED", prepareError) },
        )
      }
  }

  private fun reject(promise: Promise, code: String, error: Exception) {
    promise.reject(code, error.message ?: "Play Integrity request failed.", error)
  }
}
