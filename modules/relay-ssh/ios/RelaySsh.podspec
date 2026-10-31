require 'json'

# `spm_dependency` comes from React Native's react_native_pods.rb, which the Podfile loads first;
# load it ourselves when the spec is evaluated on its own (`pod ipc spec`).
unless defined?(spm_dependency)
  require File.join(File.dirname(`node --print "require.resolve('react-native/package.json')"`), 'scripts/react_native_pods')
end

Pod::Spec.new do |s|
  s.name           = 'RelaySsh'
  s.version        = '0.1.0'
  s.summary        = 'Native SSH client (SwiftNIO SSH) for Hop'
  s.description    = 'SSH transport, shell, exec channels and key handling for the relay-ssh Expo module.'
  s.license        = 'MIT'
  s.author         = 'Hop'
  s.homepage       = 'https://github.com/momodev1/replay'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Apple's packages only (no forks). Network.framework transport so the cellular radio and
  # on-demand VPNs come up like they do for URLSession.
  spm_dependency(s,
    url: 'https://github.com/apple/swift-nio-ssh.git',
    requirement: { kind: 'upToNextMinorVersion', minimumVersion: '0.15.1' },
    products: ['NIOSSH']
  )
  spm_dependency(s,
    url: 'https://github.com/apple/swift-nio.git',
    requirement: { kind: 'upToNextMajorVersion', minimumVersion: '2.81.0' },
    products: ['NIOCore']
  )
  spm_dependency(s,
    url: 'https://github.com/apple/swift-nio-transport-services.git',
    requirement: { kind: 'upToNextMajorVersion', minimumVersion: '1.20.0' },
    products: ['NIOTransportServices']
  )

  s.source_files = '*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
