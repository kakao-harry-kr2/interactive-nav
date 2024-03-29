import React, { useState, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Alert,
  Text,
  View,
  Platform,
  ScrollView,
  Dimensions,
  TouchableOpacity,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import JSSoup from "jssoup";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const LOCATION_TASK_NAME = "LocationUpdate";
const REST_API_KEY = "ba75db799f114acf97d205f028cd1cf2";
const CLOSED_DISTANCE = 3e-8;
const CLOSED_BUS_STOP_DISTANCE = 3e-7;
const MINUTES_TO_ALERT_SUBWAY = 3;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function requestPermissions() {
  const foregroundPromise = await Location.requestForegroundPermissionsAsync();
  const backgroundPromise = await Location.requestBackgroundPermissionsAsync();

  if (
    foregroundPromise.status === "granted" &&
    backgroundPromise.status === "granted"
  ) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Highest,
    });
  }
}
async function schedulePushNotification({ title, body }) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: { seconds: 1 },
  });
}
async function registerForPushNotificationsAsync() {
  let token;
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    alert("Failed to get push token for push notification!");
    return;
  }
  token = (await Notifications.getExpoPushTokenAsync()).data;
  console.log(token);

  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  return token;
}

let syncVariable = true;
export default function Public(props) {
  TaskManager.defineTask(
    LOCATION_TASK_NAME,
    ({ data: { locations }, error }) => {
      if (error) {
        // check `error.message` for more details.
        return;
      }
      const currentLoc = {
        latitude: locations[0]["coords"]["latitude"],
        latitudeDelta: 0.010011167287203193,
        longitude: locations[0]["coords"]["longitude"],
        longitudeDelta: 0.008252863819677714,
      };
      if (!test) {
        setLocation(currentLoc);
      }
    }
  );
  const [useApp, setUseApp] = useState(true);
  const [test, setTest] = useState(false);
  // routes.keys: { "data-sx", "data-sy", "data-ex", "data-ey", "class", "txt_station",
  //                "bus_num", "txt_detail", "data-id", "data-buses", "subway_num" }
  const [routes, setRoutes] = useState(null);
  const [routeIndex, setRouteIndex] = useState(1);
  const [location, setLocation] = useState({
    // Korea Univ. to be modified!
    latitude: 37.58930817044492,
    latitudeDelta: 0.010000000000594866,
    longitude: 127.03427082427791,
    longitudeDelta: 0.008243657890659506,
  });
  const [nextLocation, setNextLocation] = useState(null);
  // public_bus
  const [prevBusLoc, setPrevBusLoc] = useState(null);
  const [toPrevBusLoc, setToPrevBusLoc] = useState(true);
  // public_subway
  const [timeDuration, setTimeDuration] = useState(0);
  const [timeToAlert, setTimeToAlert] = useState(null);
  const [subwayBtnAvailable, setSubwayBtnAvailable] = useState(false);
  // notifications
  const [expoPushToken, setExpoPushToken] = useState("");
  const [notification, setNotification] = useState(false);
  const notificationListener = useRef();
  const responseListener = useRef();

  const getListSectionListDetail = (htmlText) => {
    const soup = new JSSoup(htmlText);
    const ol_element = soup.find("ol");
    const li_elements = ol_element.contents;
    const new_routes = [];
    li_elements.forEach((element) => {
      let route = {};

      route["data-sx"] =
        "data-sx" in element.attrs ? element.attrs["data-sx"] : "";
      route["data-sy"] =
        "data-sy" in element.attrs ? element.attrs["data-sy"] : "";
      route["data-ex"] =
        "data-ex" in element.attrs ? element.attrs["data-ex"] : "";
      route["data-ey"] =
        "data-ey" in element.attrs ? element.attrs["data-ey"] : "";

      const a_elements = element.contents;
      if (a_elements[0].contents[0].attrs["class"].includes("detail_start")) {
        route["class"] = "depart";
        route["txt_station"] = String(
          a_elements[0].contents[0].contents[2].string
        );
      } else if (
        a_elements[0].contents[0].attrs["class"].includes("public_walk")
      ) {
        route["class"] = "public_walk";
        route["txt_station"] = String(
          a_elements[0].contents[0].contents[1].string
        );
      } else if (
        a_elements[0].contents[0].attrs["class"].includes("public_bus") &&
        route["data-sx"] !== ""
      ) {
        route["class"] = "public_bus depart";
        route["txt_station"] = String(
          a_elements[0].contents[0].contents[1].string
        );
        route["bus_num"] = String(
          a_elements[0].contents[0].contents[2].contents[1].contents[0]
            .descendants[2]
        );
        route["txt_detail"] = String(
          a_elements[0].contents[0].contents[3].string
        );
        route["data-id"] = a_elements[1].attrs["data-id"];
        route["data-buses"] = a_elements[1].attrs["data-buses"];
      } else if (
        a_elements[0].contents[0].attrs["class"].includes("public_bus") &&
        route["data-sx"] === ""
      ) {
        route["class"] = "public_bus arrive";
        route["txt_station"] = String(
          a_elements[0].contents[0].contents[1].string
        );
      } else if (
        a_elements[0].contents[0].attrs["class"].includes("public_subway") &&
        route["data-sx"] !== ""
      ) {
        route["class"] = "public_subway depart";
        route["txt_station"] = String(
          a_elements[0].contents[0].contents[1].string
        );
        route["subway_num"] = String(
          a_elements[0].contents[0].contents[0].descendants[0]
        );
        route["txt_detail"] = String(
          a_elements[0].contents[0].contents[3].string
        );
      } else if (
        a_elements[0].contents[0].attrs["class"].includes("public_subway") &&
        route["data-sx"] === ""
      ) {
        route["class"] = "public_subway arrive";
        route["txt_station"] = String(
          a_elements[0].contents[0].contents[1].string
        );
      } else {
        route["class"] = "destination arrive";
        route["txt_station"] =
          String(a_elements[0].contents[1].string) + "도착!";
      }
      new_routes.push(route);
    });
    setRoutes(new_routes);
  };
  const getJustBeforeBusStopLocation = (HTMLText) => {
    const justBeforeBusStopSoup = new JSSoup(HTMLText);
    const articleElement = justBeforeBusStopSoup.find("article");
    const busStopLocation =
      articleElement.contents[3].contents[1].contents[1].contents[1];
    changeCoords(
      {
        "data-wx": busStopLocation.attrs["data-wx"],
        "data-wy": busStopLocation.attrs["data-wy"],
      },
      "prev"
    );
  };
  const getJustBeforeBusStopHTML = (href) => {
    const justBeforeBusStopUrl = `https://m.map.kakao.com${href}`;
    const request = new XMLHttpRequest();
    request.open("GET", justBeforeBusStopUrl, true);
    request.onload = () => {
      getJustBeforeBusStopLocation(request.responseText);
    };
    request.send();
  };
  const getJustBeforeBusStopUrl = (busRoutes, HTMLText) => {
    const sIndex = busRoutes[0]["txt_detail"].indexOf(" ");
    const eIndex = busRoutes[0]["txt_detail"].indexOf("개");
    const steps = parseInt(
      busRoutes[0]["txt_detail"].substring(sIndex + 1, eIndex)
    );
    const departBusStopName = busRoutes[0]["txt_station"].substring(
      0,
      busRoutes[0]["txt_station"].indexOf("(")
    );
    const ArriveBusStopName = busRoutes[1]["txt_station"].substring(
      0,
      busRoutes[1]["txt_station"].indexOf("(")
    );
    const busInfoSoup = new JSSoup(HTMLText);
    let listRouteElements = null;
    busInfoSoup.findAll("ul").forEach((element) => {
      if (element.attrs["class"] === "list_route") {
        listRouteElements = element;
      }
    });
    const li_elements = listRouteElements.contents;
    for (let i = 0; i < li_elements.length; i++) {
      if (
        li_elements[i].attrs["data-name"] === departBusStopName &&
        li_elements[i + steps].attrs["data-name"] === ArriveBusStopName
      ) {
        getJustBeforeBusStopHTML(
          li_elements[i + steps - 1].contents[1].attrs["href"]
        );
        break;
      }
    }
  };
  const getBusInfoHTML = (busRoutes) => {
    const busId = busRoutes[0]["data-buses"];
    const busStopId = busRoutes[0]["data-id"];
    const busInfoUrl = `https://m.map.kakao.com/actions/busDetailInfo?busId=${busId}&busStopId=${busStopId}`;
    const request = new XMLHttpRequest();
    request.open("GET", busInfoUrl, true);
    request.onload = () => {
      getJustBeforeBusStopUrl(busRoutes, request.responseText);
    };
    request.send();
  };
  const changeCoords = (WCONGNAMUL, type) => {
    const url = `https://dapi.kakao.com/v2/local/geo/transcoord.json?x=${WCONGNAMUL["data-wx"]}&y=${WCONGNAMUL["data-wy"]}&input_coord=WCONGNAMUL&output_coord=WGS84`;
    const request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.setRequestHeader("Authorization", "KakaoAK " + REST_API_KEY);
    request.onload = () => {
      const document = JSON.parse(request.responseText).documents[0];
      const WGS84 = { latitude: document["y"], longitude: document["x"] };
      if (type === "next") {
        setNextLocation(WGS84);
        syncVariable = true;
      } else if (type === "prev") {
        setPrevBusLoc(WGS84);
      }
    };
    request.send();
  };

  // request permissions & public routes
  useEffect(() => {
    requestPermissions();

    const request = new XMLHttpRequest();
    request.open("GET", props.url, true);
    request.onload = () => {
      getListSectionListDetail(request.responseText);
    };
    request.send();
  }, []);
  // initialize nextLocation
  useEffect(() => {
    if (routes === null) return;

    changeCoords(
      {
        "data-wx": routes[1]["data-ex"],
        "data-wy": routes[1]["data-ey"],
      },
      "next"
    );
  }, [routes]);
  // notifications
  useEffect(() => {
    registerForPushNotificationsAsync().then((token) =>
      setExpoPushToken(token)
    );

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        setNotification(notification);
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        console.log(response);
      });

    return () => {
      Notifications.removeNotificationSubscription(
        notificationListener.current
      );
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);
  // change coordinates to WGS84 & set public notifications
  useEffect(() => {
    if (routes === null) return;

    // if current route is public_bus depart -> get bus route and set prev bus stop location
    if (routes[routeIndex]["class"] === "public_bus depart") {
      // const reply = Alert.alert(
      //   "Public bus depart",
      //   "Do you want to receive Alert at previous bus stop?"
      // );
      getBusInfoHTML([routes[routeIndex], routes[routeIndex + 1]]);
    } else {
      setPrevBusLoc(null);
    }
    // if current route is public_subway depart -> get time duration and set timerDuration
    if (routes[routeIndex]["class"] === "public_subway depart") {
      // const reply = Alert.alert(
      //   "Public subway depart",
      //   "Do you want to receive Alert at previous subway station?"
      // );
      const subway_detail = routes[routeIndex]["txt_detail"];
      let hours = 0;
      let minutes = 0;
      if (subway_detail.includes("시간")) {
        hours = parseInt(
          subway_detail.substring(0, subway_detail.indexOf("시"))
        );
      }
      if (subway_detail.includes("분")) {
        minutes = parseInt(
          subway_detail.substring(0, subway_detail.indexOf("분"))
        );
      }
      console.log(`${hours}h ${minutes}min!`);
      setSubwayBtnAvailable(true);
      setTimeDuration(hours * 60 + minutes - MINUTES_TO_ALERT_SUBWAY);
    }
  }, [routes, routeIndex]);
  // track current location & timestamp
  useEffect(() => {
    if (nextLocation === null) return;

    // about routeIndex
    const distToNext =
      (location.latitude - nextLocation.latitude) ** 2 +
      (location.longitude - nextLocation.longitude) ** 2;

    if (distToNext < CLOSED_DISTANCE && syncVariable === true) {
      if (routeIndex === routes.length - 1) {
        setUseApp(false);
      } else {
        syncVariable = false;
        changeCoords(
          {
            "data-wx": routes[routeIndex + 1]["data-ex"],
            "data-wy": routes[routeIndex + 1]["data-ey"],
          },
          "next"
        );
        setRouteIndex(routeIndex + 1);
      }
    }

    // alert at previous bus stop
    if (prevBusLoc !== null) {
      const distToPrev =
        (location.latitude - prevBusLoc.latitude) ** 2 +
        (location.longitude - prevBusLoc.longitude) ** 2;
      if (toPrevBusLoc === true && distToPrev < CLOSED_BUS_STOP_DISTANCE) {
        setToPrevBusLoc(false);
      } else if (
        toPrevBusLoc === false &&
        distToPrev > CLOSED_BUS_STOP_DISTANCE
      ) {
        schedulePushNotification({
          title: "InteractiveMap",
          body: "다음 정거장에서 하차하세요!",
        });
        setToPrevBusLoc(true);
      }
    }

    // alert at previous subway station
    if (timeToAlert !== null) {
      const currentTime = Date.parse(new Date());
      if (currentTime > timeToAlert) {
        schedulePushNotification({
          title: "InteractiveMap",
          body: "도착 예정 시간 3분 남았습니다!",
        });
        setTimeToAlert(null);
      }
    }
  }, [location]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 3 }}>
        <MapView
          style={{ flex: 1 }}
          initialRegion={location}
          region={test ? null : location}
          onRegionChange={(region) => {
            if (test) {
              setLocation(region);
            }
          }}
        >
          <View>
            {location === null ? null : (
              <Marker
                coordinate={{
                  latitude: location["latitude"],
                  longitude: location["longitude"],
                }}
                pinColor="red"
              />
            )}
          </View>
          {nextLocation === null ? null : (
            <Marker coordinate={nextLocation} pinColor="blue" />
          )}
        </MapView>
      </View>
      {useApp ? (
        <View style={{ flex: 1, backgroundColor: "skyblue" }}>
          {routes === null ? (
            <View style={{ justifyContent: "center", alignItems: "center" }}>
              <ActivityIndicator />
            </View>
          ) : (
            <ScrollView
              pagingEnabled
              horizontal
              contentContainerStyle={styles.routes}
              contentOffset={{ x: SCREEN_WIDTH * routeIndex, y: 0 }}
            >
              {routes.map((route, index) => (
                <View key={index} style={styles.route}>
                  <View
                    style={
                      index === routeIndex
                        ? { ...styles.route_details, backgroundColor: "yellow" }
                        : { ...styles.route_details, backgroundColor: "grey" }
                    }
                  >
                    <View style={{ flex: 1 }}>
                      {index === routeIndex ? (
                        <View style={{ flex: 1, flexDirection: "row" }}>
                          <TouchableOpacity
                            onPress={() => {
                              setTest(false);
                            }}
                            style={styles.typeButton}
                          >
                            <Text
                              style={{ marginTop: "4%", fontWeight: "600" }}
                            >
                              useApp
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => {
                              setTest(true);
                            }}
                            style={styles.typeButton}
                          >
                            <Text
                              style={{ marginTop: "4%", fontWeight: "600" }}
                            >
                              useTest
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                    <View style={{ flex: 3 }}>
                      <Text
                        style={{
                          flex: 1,
                          textAlign: "center",
                          fontSize: 18,
                          fontWeight: "700",
                        }}
                      >
                        {route["txt_station"]}
                      </Text>
                      {route["class"] === "public_bus depart" ? (
                        <View style={{ flex: 2, alignItems: "center" }}>
                          <Text style={{ flex: 1, fontWeight: "600" }}>
                            Bus No: {route["bus_num"]}
                          </Text>
                          <Text style={{ flex: 1, fontWeight: "600" }}>
                            {route["txt_detail"]}
                          </Text>
                        </View>
                      ) : null}
                      {route["class"] === "public_subway depart" ? (
                        <View style={{ flex: 4, alignItems: "center" }}>
                          <Text style={{ flex: 1, fontWeight: "600" }}>
                            Subway No: {route["subway_num"]}
                          </Text>
                          <Text style={{ flex: 1, fontWeight: "600" }}>
                            {route["txt_detail"]}
                          </Text>
                          <TouchableOpacity
                            style={{
                              flex: 2,
                              width: "70%",
                              backgroundColor: "tomato",
                              borderRadius: 20,
                            }}
                            onPress={() => {
                              if (subwayBtnAvailable) {
                                setSubwayBtnAvailable(false);
                                schedulePushNotification({
                                  title: "InteractiveMap",
                                  body: timeDuration + "분 후에 알려드릴께요!",
                                });
                                setTimeToAlert(
                                  Date.parse(new Date()) + timeDuration * 60000
                                );
                              }
                            }}
                          >
                            {routeIndex === index ? (
                              <Text
                                style={{
                                  flex: 1,
                                  textAlign: "center",
                                  marginTop: "6%",
                                  fontWeight: "600",
                                }}
                              >
                                {subwayBtnAvailable
                                  ? "Press when getting on the subway!"
                                  : timeToAlert !== null
                                  ? parseInt(
                                      (timeToAlert - Date.parse(new Date())) /
                                        60000 +
                                        1
                                    ) + "분 후에 알림 전송!"
                                  : "내릴 준비 하세요!"}
                              </Text>
                            ) : null}
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  routes: {},
  route: {
    width: SCREEN_WIDTH,
    alignItems: "flex-start",
  },
  route_details: {
    width: SCREEN_WIDTH * 0.9,
    height: "80%",
    marginVertical: "5%",
    marginHorizontal: "5%",
    borderRadius: 15,
    paddingVertical: "2%",
    paddingHorizontal: "2%",
  },
  typeButton: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: 20,
    marginVertical: 5,
    borderRadius: 15,
    backgroundColor: "tomato",
  },
});
