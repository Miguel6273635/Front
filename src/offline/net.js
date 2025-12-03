import NetInfo from '@react-native-community/netinfo';
let online = true;
export function listenNet(cb){
  const unsub = NetInfo.addEventListener(s => { online = !!s.isConnected && !!s.isInternetReachable; cb?.(online); });
  return () => unsub();
}
export function isOnline(){ return online; }
