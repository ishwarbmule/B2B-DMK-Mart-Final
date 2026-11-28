/**
 * DMK Mart — customer app root.
 * Flow: boot → Login → (forced ChangePassword) → WarehouseSelect → Main tabs.
 * Main tabs: Home · Cart · Orders · Account, plus product/cart/checkout stack.
 */
import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppProvider, useApp, cartCount } from "./src/store/app";
import { C } from "./src/components/ui";
import { LoginScreen } from "./src/screens/Login";
import { ChangePasswordScreen } from "./src/screens/ChangePassword";
import { WarehouseSelectScreen } from "./src/screens/WarehouseSelect";
import { HomeScreen } from "./src/screens/Home";
import { ProductListScreen } from "./src/screens/ProductList";
import { ProductDetailScreen } from "./src/screens/ProductDetail";
import { CartScreen } from "./src/screens/Cart";
import { CheckoutScreen } from "./src/screens/Checkout";
import { OrderSuccessScreen } from "./src/screens/OrderSuccess";
import { OrdersScreen } from "./src/screens/Orders";
import { AccountScreen } from "./src/screens/Account";

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const TAB_ICONS: Record<string, string> = { Home: "🏠", Cart: "🛒", Orders: "📦", Account: "👤" };

function MainTabs() {
  const { cart } = useApp();
  const count = cartCount(cart);
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: C.ink,
        tabBarInactiveTintColor: "#9CA3AF",
        tabBarLabelStyle: { fontWeight: "800", fontSize: 11 },
        tabBarIcon: ({ focused }) => (
          <View>
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{TAB_ICONS[route.name] ?? "•"}</Text>
            {route.name === "Cart" && count > 0 ? (
              <View style={{ position: "absolute", right: -10, top: -4, backgroundColor: C.amber, borderRadius: 9, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900" }}>{count}</Text>
              </View>
            ) : null}
          </View>
        ),
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen as never} />
      <Tabs.Screen name="Cart" component={CartScreen as never} />
      <Tabs.Screen name="Orders" component={OrdersScreen as never} />
      <Tabs.Screen name="Account" component={AccountScreen as never} />
    </Tabs.Navigator>
  );
}

function Boot() {
  return (
    <View style={{ flex: 1, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: C.yellow, fontSize: 26, fontWeight: "900", letterSpacing: 1 }}>DMK Mart</Text>
      <ActivityIndicator color={C.yellow} style={{ marginTop: 16 }} />
    </View>
  );
}

function Root() {
  const { booting, customer, warehouse } = useApp();
  if (booting) return <Boot />;
  if (!customer) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen as never} />
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen as never} />
      </Stack.Navigator>
    );
  }
  if (customer.mustChangePassword) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen as never} />
      </Stack.Navigator>
    );
  }
  if (!warehouse) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="WarehouseSelect" component={WarehouseSelectScreen as never} />
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen as never} />
      </Stack.Navigator>
    );
  }
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: C.ink },
        headerTintColor: C.yellow,
        headerTitleStyle: { fontWeight: "900" },
        headerBackTitle: "",
      }}
    >
      <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="ProductList" component={ProductListScreen as never} options={{ headerBackTitle: "" }} />
      <Stack.Screen name="Search" component={ProductListScreen as never} options={{ headerBackTitle: "" }} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen as never} options={{ title: "Product", headerBackTitle: "" }} />
      <Stack.Screen name="Cart" component={CartScreen as never} options={{ title: "My cart", headerBackTitle: "" }} />
      <Stack.Screen name="Checkout" component={CheckoutScreen as never} options={{ title: "Checkout", headerBackTitle: "" }} />
      <Stack.Screen name="OrderSuccess" component={OrderSuccessScreen as never} options={{ title: "Order placed", headerBackTitle: "" }} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen as never} options={{ title: "Password", headerBackTitle: "" }} />
      <Stack.Screen name="WarehouseSelect" component={WarehouseSelectScreen as never} options={{ title: "Change godown", headerBackTitle: "" }} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <NavigationContainer>
          <Root />
        </NavigationContainer>
      </AppProvider>
    </SafeAreaProvider>
  );
}
