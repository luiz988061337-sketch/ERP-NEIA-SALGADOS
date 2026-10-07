plugins {
    id("com.android.application") version "8.1.0" apply false
    id("org.jetbrains.kotlin.android") version "1.9.0" apply false
    id("com.google.gms.google-services") version "4.4.2" apply false
}

android {
    namespace "com.neia.pixreader"
    compileSdk 34

    defaultConfig {
        applicationId "com.neia.pixreader"
        minSdk 24
        targetSdk 34
        versionCode 1
        versionName "1.0.0"

        // Enable screen-orientation support
        vectorDrawables.useSupportLibrary = true
    }

    buildTypes {
        release {
            minifyEnabled true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize"), "proguard-rules.pro")
        }
        debug {
            minifyEnabled false
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
        release {
            enable true
        }
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:2.1.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.5")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}