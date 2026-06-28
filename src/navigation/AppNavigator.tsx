import { useRef, useState } from 'react';
import {
  CommonActions,
  createNavigationContainerRef,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import EntryScreen from '../screens/entry/EntryScreen';
import NewEntryScreen from '../screens/entry/NewEntryScreen';
import { authService } from '../services/auth.service';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();
const MENU_MAX_WIDTH = 380;

const linking = {
  prefixes: ['http://localhost:8081', 'https://pacientelab.com'],
  config: {
    screens: {
      Login: 'login',
      Register: 'register',
      Entry: 'entry',
      New: 'new',
    },
  },
};

export default function AppNavigator() {
  const [currentRouteName, setCurrentRouteName] = useState<keyof RootStackParamList>('Login');
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const menuTranslateX = useRef(new Animated.Value(MENU_MAX_WIDTH)).current;

  const isAuthRoute = currentRouteName === 'Entry' || currentRouteName === 'New';

  const updateCurrentRoute = () => {
    if (!navigationRef.isReady()) {
      return;
    }

    const currentRoute = navigationRef.getCurrentRoute()?.name;

    if (currentRoute) {
      setCurrentRouteName(currentRoute);
    }
  };

  const navigateTo = (routeName: 'Entry' | 'New') => {
    closeMenu();

    if (navigationRef.isReady()) {
      navigationRef.navigate(routeName);
    }
  };

  const openMenu = () => {
    menuTranslateX.setValue(MENU_MAX_WIDTH);
    setIsMenuVisible(true);

    requestAnimationFrame(() => {
      Animated.timing(menuTranslateX, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
    });
  };

  const closeMenu = (onClosed?: () => void) => {
    Animated.timing(menuTranslateX, {
      toValue: MENU_MAX_WIDTH,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }

      setIsMenuVisible(false);
      onClosed?.();
    });
  };

  const handleLogout = async () => {
    await authService.clearSession();

    closeMenu(() => {
      if (navigationRef.isReady()) {
        navigationRef.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          }),
        );
      }
    });
  };

  return (
    <View style={styles.root}>
      <NavigationContainer
        ref={navigationRef}
        linking={linking}
        onReady={updateCurrentRoute}
        onStateChange={updateCurrentRoute}
      >
        <Stack.Navigator
          initialRouteName="Login"
          screenOptions={{
            headerShown: false,
            contentStyle: isAuthRoute ? styles.screenContent : undefined,
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="Entry" component={EntryScreen} />
          <Stack.Screen name="New" component={NewEntryScreen} />
        </Stack.Navigator>
      </NavigationContainer>

      {isAuthRoute && (
        <View style={styles.bottomNavBar}>
          <TouchableOpacity
            style={[styles.navButton, currentRouteName === 'Entry' && styles.navButtonActive]}
            onPress={() => navigateTo('Entry')}
            activeOpacity={0.85}
          >
            <Text style={[styles.navButtonText, currentRouteName === 'Entry' && styles.navButtonTextActive]}>
              Lista
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navButton, currentRouteName === 'New' && styles.navButtonActive]}
            onPress={() => navigateTo('New')}
            activeOpacity={0.85}
          >
            <Text style={[styles.navButtonText, currentRouteName === 'New' && styles.navButtonTextActive]}>
              Adicionar entry
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navButton}
            onPress={openMenu}
            activeOpacity={0.85}
          >
            <Text style={styles.navButtonText}>Menu</Text>
          </TouchableOpacity>
        </View>
      )}

      {isAuthRoute && (
        <Modal
          visible={isMenuVisible}
          animationType="none"
          transparent
          onRequestClose={() => closeMenu()}
        >
          <View style={styles.menuOverlay}>
            <Pressable style={styles.menuBackdrop} onPress={() => closeMenu()} />

            <Animated.View
              style={[
                styles.menuPanel,
                {
                  transform: [{ translateX: menuTranslateX }],
                },
              ]}
            >
              <View style={styles.menuHeader}>
                <View style={styles.menuAvatar}>
                  <Text style={styles.menuAvatarText}>PL</Text>
                </View>
                <View style={styles.menuHeaderTextWrapper}>
                  <Text style={styles.menuTitle}>Patient Lab</Text>
                  <Text style={styles.menuSubtitle}>Menu principal</Text>
                </View>

                <TouchableOpacity
                  style={styles.closeIconButton}
                  onPress={() => closeMenu()}
                  activeOpacity={0.85}
                >
                  <Text style={styles.closeIconText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.menuSection}>
                <Text style={styles.menuSectionTitle}>Ações</Text>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => void handleLogout()}
                  activeOpacity={0.85}
                >
                  <View style={styles.menuItemLeft}>
                    <View style={styles.menuItemIconWrapper}>
                      <Text style={styles.menuItemIcon}>⏻</Text>
                    </View>
                    <Text style={styles.menuItemText}>Logout</Text>
                  </View>
                  <Text style={styles.menuItemChevron}>›</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  screenContent: {
    paddingBottom: 84,
  },
  bottomNavBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#111827',
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 18,
  },
  navButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1f2937',
  },
  navButtonActive: {
    backgroundColor: '#2563eb',
  },
  navButtonText: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  navButtonTextActive: {
    color: '#ffffff',
  },
  menuOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  menuBackdrop: {
    flex: 1,
  },
  menuPanel: {
    width: '82%',
    maxWidth: MENU_MAX_WIDTH,
    height: '100%',
    backgroundColor: '#ffffff',
    paddingHorizontal: 18,
    paddingTop: 46,
    paddingBottom: 24,
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },
  menuAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuAvatarText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  menuHeaderTextWrapper: {
    flex: 1,
    marginLeft: 10,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  menuSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#6b7280',
  },
  closeIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIconText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  menuSection: {
    gap: 10,
  },
  menuSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#9ca3af',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffe4e6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  menuItemIcon: {
    color: '#dc2626',
    fontSize: 14,
  },
  menuItemText: {
    color: '#991b1b',
    fontWeight: '700',
    fontSize: 14,
  },
  menuItemChevron: {
    color: '#be123c',
    fontWeight: '600',
    fontSize: 18,
  },
});
