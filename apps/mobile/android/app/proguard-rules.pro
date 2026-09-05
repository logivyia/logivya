# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# Expo SDK 54 does not export these bundled consumer rules to the app's R8 pass.
# TaskService persists consumer class names; preserve them across app upgrades.
# Upstream fixes: expo/expo#45974 (notifications), expo/expo#46029 (task-manager).
-keep class expo.modules.notifications.** { *; }
-keep class expo.modules.taskManager.** { *; }

# AppLoaderProvider loads this class by its AndroidManifest metadata string.
-keep class expo.modules.adapters.react.apploader.RNHeadlessAppLoader { *; }

# SDK 54's SecureStore options travel through Kotlin reflection and Expo record
# conversion. Preserve this runtime boundary so device IDs and encrypted sessions
# survive reads/writes in optimized release builds, including MFA verification.
-keep class expo.modules.securestore.** { *; }
-keep class expo.modules.kotlin.** { *; }
-keep class kotlin.reflect.** { *; }
-keep class kotlin.Metadata { *; }
