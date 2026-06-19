// src/offline/net.js
import NetInfo from "@react-native-community/netinfo";

export async function getNetworkState() {
  const st = await NetInfo.fetch();

  const online = !!st.isConnected && st.isInternetReachable !== false;

  const type = st.type;
  const cellularGeneration = String(
    st.details?.cellularGeneration || "",
  ).toLowerCase();

  const isWifi = type === "wifi";
  const isGoodCellular =
    type === "cellular" &&
    (cellularGeneration === "4g" || cellularGeneration === "5g");

  const stable = online && (isWifi || isGoodCellular);

  return {
    online,
    stable,
    type,
    cellularGeneration: cellularGeneration || null,
    isConnected: st.isConnected,
    isInternetReachable: st.isInternetReachable,
  };
}

export async function isOnline() {
  const st = await getNetworkState();
  return st.online;
}

export async function isStableNetwork() {
  const st = await getNetworkState();
  return st.stable;
}

export function subscribeOnline(cb) {
  return NetInfo.addEventListener((st) => {
    const online = !!st.isConnected && st.isInternetReachable !== false;
    cb(online);
  });
}