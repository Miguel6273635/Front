import NetInfo from "@react-native-community/netinfo";

export async function isOnline() {
  const st = await NetInfo.fetch();

  // ✅ estricto: SOLO online si reachability es TRUE
  // (en muchos phones es null aunque no haya internet)
  return !!(st.isConnected && st.isInternetReachable === true);
}

export function subscribeOnline(cb) {
  return NetInfo.addEventListener((st) => {
    const online = !!(st.isConnected && st.isInternetReachable === true);
    cb(online);
  });
}
