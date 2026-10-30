# Applied to the app's release build (consumerProguardFiles).

# JVM-only classes referenced by sshj / eddsa / BouncyCastle code paths Android never takes.
-dontwarn sun.security.x509.**
-dontwarn org.ietf.jgss.**
-dontwarn javax.security.auth.login.**
-dontwarn javax.security.auth.kerberos.**
-dontwarn javax.naming.**
-dontwarn com.jcraft.jzlib.**
-dontwarn org.slf4j.**

# BouncyCastle registers its algorithms by class name and sshj builds factories reflectively.
-keep class org.bouncycastle.** { *; }
-keep class net.schmizz.sshj.** { *; }
-keep class com.hierynomus.sshj.** { *; }
-keep class net.i2p.crypto.eddsa.** { *; }
-dontwarn org.bouncycastle.**
