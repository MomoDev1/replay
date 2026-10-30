import * as SecureStore from 'expo-secure-store';

// SecureStore keys only allow [A-Za-z0-9._-].
const pwd = (serverId: string) => `pwd.${serverId}`;
const priv = (keyId: string) => `key.${keyId}`;
const pass = (keyId: string) => `pass.${keyId}`;

export const getPassword = (serverId: string) => SecureStore.getItemAsync(pwd(serverId));
export const setPassword = (serverId: string, v: string) => SecureStore.setItemAsync(pwd(serverId), v);
export const deletePassword = (serverId: string) => SecureStore.deleteItemAsync(pwd(serverId));

export const getPrivateKey = async (keyId: string) => ({
  privateKey: await SecureStore.getItemAsync(priv(keyId)),
  passphrase: await SecureStore.getItemAsync(pass(keyId)),
});

export async function setPrivateKey(keyId: string, privateKey: string, passphrase?: string) {
  await SecureStore.setItemAsync(priv(keyId), privateKey);
  if (passphrase) await SecureStore.setItemAsync(pass(keyId), passphrase);
}

export async function deletePrivateKey(keyId: string) {
  await SecureStore.deleteItemAsync(priv(keyId));
  await SecureStore.deleteItemAsync(pass(keyId));
}
