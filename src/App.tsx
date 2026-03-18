import { useState, useEffect } from 'react';
import { 
  Search, 
  ShoppingBag, 
  User as UserIcon, 
  MapPin, 
  Star, 
  Clock, 
  ChevronRight,
  Filter,
  Plus,
  Minus,
  X,
  Store,
  Truck,
  LayoutDashboard,
  LogOut,
  Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  doc, 
  setDoc, 
  getDoc,
  addDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { Restaurant, MenuItem, Order, UserProfile } from './types';
import ImageWithSkeleton from './components/ImageWithSkeleton';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<{item: MenuItem, quantity: number}[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'orders' | 'dashboard'>('home');
  const [searchQuery, setSearchQuery] = useState('');

  const seedData = async () => {
    if (!user || user.role !== 'admin') {
      alert("Apenas administradores podem popular os dados.");
      return;
    }

    const sampleRestaurants = [
      {
        name: "Burger King",
        category: "Hambúrguer",
        rating: 4.5,
        deliveryFee: 5.90,
        status: "active",
        ownerId: user.uid,
        isPatronized: true,
        logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Burger_King_2020.svg/1200px-Burger_King_2020.svg.png"
      },
      {
        name: "Pizza Hut",
        category: "Pizza",
        rating: 4.7,
        deliveryFee: 0,
        status: "active",
        ownerId: user.uid,
        isPatronized: false,
        logoUrl: "https://upload.wikimedia.org/wikipedia/sco/thumb/d/d2/Pizza_Hut_logo.svg/1088px-Pizza_Hut_logo.svg.png"
      },
      {
        name: "Sushi Zen",
        category: "Japonesa",
        rating: 4.9,
        deliveryFee: 12.00,
        status: "active",
        ownerId: user.uid,
        isPatronized: true,
        logoUrl: "https://cdn-icons-png.flaticon.com/512/2252/2252439.png"
      }
    ];

    for (const res of sampleRestaurants) {
      const docRef = await addDoc(collection(db, 'restaurants'), res);
      // Add menu items
      const menuRef = collection(db, 'restaurants', docRef.id, 'menu');
      await addDoc(menuRef, { name: "Combo Clássico", price: 35.90, description: "O melhor do cardápio", available: true });
      await addDoc(menuRef, { name: "Item Especial", price: 45.00, description: "Edição limitada", available: true });
    }
    alert("Dados populados com sucesso!");
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          setUser(userDoc.data() as UserProfile);
        } else {
          // Create new user profile
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || 'User',
            email: firebaseUser.email || '',
            role: firebaseUser.email === 'grupoujt@gmail.com' ? 'admin' : 'customer',
            createdAt: new Date().toISOString()
          };
          await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
          setUser(newProfile);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Restaurants Listener
  useEffect(() => {
    const q = query(collection(db, 'restaurants'), where('status', '==', 'active'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Restaurant));
      setRestaurants(list);
    });
    return unsubscribe;
  }, []);

  // Menu Items Listener
  useEffect(() => {
    if (selectedRestaurant) {
      const q = collection(db, 'restaurants', selectedRestaurant.id, 'menu');
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem));
        setMenuItems(list);
      });
      return unsubscribe;
    }
  }, [selectedRestaurant]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setActiveTab('home');
    setSelectedRestaurant(null);
  };

  const handleTabChange = (tab: 'home' | 'orders' | 'dashboard') => {
    setActiveTab(tab);
    setSelectedRestaurant(null);
  };

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.item.id === item.id);
      if (existing) {
        return prev.map(i => i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(i => i.item.id !== itemId));
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.item.id === itemId) {
        const newQty = Math.max(0, i.quantity + delta);
        return { ...i, quantity: newQty };
      }
      return i;
    }).filter(i => i.quantity > 0));
  };

  const cartTotal = cart.reduce((sum, i) => sum + (i.item.price * i.quantity), 0);

  const handleCheckout = async () => {
    if (!user) return handleLogin();
    if (!selectedRestaurant) return;

    const orderData = {
      customerId: user.uid,
      restaurantId: selectedRestaurant.id,
      items: cart.map(i => ({
        itemId: i.item.id,
        name: i.item.name,
        price: i.item.price,
        quantity: i.quantity
      })),
      total: cartTotal + selectedRestaurant.deliveryFee,
      deliveryFee: selectedRestaurant.deliveryFee,
      status: 'pending',
      createdAt: serverTimestamp()
    };

    try {
      await addDoc(collection(db, 'orders'), orderData);
      setCart([]);
      setIsCartOpen(false);
      setActiveTab('orders');
      alert("Pedido realizado com sucesso!");
    } catch (error) {
      console.error("Checkout failed:", error);
    }
  };

  if (loading) return (
    <div className="h-screen w-screen flex items-center justify-center bg-white">
      <motion.div 
        animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => {setSelectedRestaurant(null); setActiveTab('home');}}>
            <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-red-200">
              F
            </div>
            <span className="font-bold text-xl tracking-tight hidden sm:block">FoodDash</span>
          </div>

          <div className="flex-1 max-w-md mx-4 hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input 
                type="text" 
                placeholder="Busque por pratos ou restaurantes"
                className="w-full bg-gray-100 border-none rounded-full py-2 pl-10 pr-4 focus:ring-2 focus:ring-red-500 transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-1 text-sm font-medium text-gray-600">
              <MapPin className="w-4 h-4 text-red-500" />
              <span>Av. Paulista, 1000</span>
            </div>
            
            <button 
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ShoppingBag className="w-6 h-6" />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
                  {cart.reduce((s, i) => s + i.quantity, 0)}
                </span>
              )}
            </button>

            {user?.role === 'admin' && (
              <button 
                onClick={seedData}
                className="hidden lg:flex items-center gap-2 bg-gray-100 text-gray-600 px-4 py-2 rounded-full text-sm font-bold hover:bg-gray-200 transition-all"
              >
                <Plus className="w-4 h-4" />
                Popular Dados
              </button>
            )}

            {user ? (
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => handleTabChange('dashboard')}
                  className={`p-2 rounded-full transition-colors ${activeTab === 'dashboard' ? 'bg-red-50 text-red-500' : 'hover:bg-gray-100 text-gray-600'}`}
                >
                  <LayoutDashboard className="w-6 h-6" />
                </button>
                <div className="w-8 h-8 bg-gray-200 rounded-full overflow-hidden border border-gray-300">
                  <UserIcon className="w-full h-full p-1 text-gray-500" />
                </div>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="bg-red-500 text-white px-6 py-2 rounded-full font-semibold hover:bg-red-600 transition-all shadow-md shadow-red-100"
              >
                Entrar
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'home' && (
          selectedRestaurant ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Restaurant Detail View */}
              <button 
                onClick={() => setSelectedRestaurant(null)}
                className="mb-6 flex items-center gap-2 text-gray-500 hover:text-red-500 transition-colors font-medium"
              >
                <ChevronRight className="w-5 h-5 rotate-180" />
                Voltar para restaurantes
              </button>

              <div className="flex flex-col md:flex-row gap-8">
                <div className="flex-1">
                  <div className="flex items-start gap-6 mb-8">
                    <ImageWithSkeleton 
                      src={selectedRestaurant.logoUrl || `https://picsum.photos/seed/${selectedRestaurant.id}/200/200`} 
                      alt={selectedRestaurant.name}
                      className="w-24 h-24 rounded-2xl shadow-md"
                    />
                    <div>
                      <h1 className="text-3xl font-bold mb-2">{selectedRestaurant.name}</h1>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                          <span className="font-bold text-gray-900">{selectedRestaurant.rating}</span>
                        </div>
                        <span>•</span>
                        <span>{selectedRestaurant.category}</span>
                        <span>•</span>
                        <span>30-45 min</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {menuItems.map(item => (
                      <motion.div 
                        key={item.id}
                        whileHover={{ y: -4 }}
                        className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex gap-4"
                      >
                        <div className="flex-1">
                          <h3 className="font-bold text-lg mb-1">{item.name}</h3>
                          <p className="text-sm text-gray-500 line-clamp-2 mb-3">{item.description}</p>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-red-500 text-lg">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price)}
                            </span>
                            <button 
                              onClick={() => addToCart(item)}
                              className="w-8 h-8 bg-red-50 rounded-full flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all"
                            >
                              <Plus className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                        <ImageWithSkeleton 
                          src={item.imageUrl || `https://picsum.photos/seed/${item.id}/150/150`} 
                          alt={item.name}
                          className="w-24 h-24 rounded-xl"
                        />
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {/* Home View */}
              <section className="mb-10">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold tracking-tight">Categorias</h2>
                  <button className="text-red-500 font-semibold text-sm hover:underline">Ver todas</button>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                  {['Pizza', 'Hambúrguer', 'Japonesa', 'Brasileira', 'Doces', 'Saudável', 'Árabe', 'Italiana'].map(cat => (
                    <button 
                      key={cat}
                      className="flex-shrink-0 px-6 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-red-200 hover:bg-red-50 transition-all font-medium"
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold tracking-tight">Restaurantes em Destaque</h2>
                  <div className="flex items-center gap-2">
                    <button className="p-2 bg-white border border-gray-100 rounded-xl shadow-sm">
                      <Filter className="w-5 h-5 text-gray-600" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {restaurants.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase())).map(restaurant => (
                    <motion.div 
                      key={restaurant.id}
                      whileHover={{ y: -8 }}
                      onClick={() => setSelectedRestaurant(restaurant)}
                      className="bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-all cursor-pointer group"
                    >
                      <div className="relative h-48 overflow-hidden">
                        <ImageWithSkeleton 
                          src={`https://picsum.photos/seed/${restaurant.id}/600/400`} 
                          alt={restaurant.name}
                          className="w-full h-full group-hover:scale-110 transition-transform duration-700"
                        />
                        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1 shadow-sm z-10">
                          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                          <span className="text-xs font-bold">{restaurant.rating}</span>
                        </div>
                        {restaurant.isPatronized && (
                          <div className="absolute top-4 left-4 bg-red-500 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg">
                            Patrocinado
                          </div>
                        )}
                      </div>
                      <div className="p-5">
                        <div className="flex items-center gap-3 mb-2">
                          <ImageWithSkeleton 
                            src={restaurant.logoUrl || `https://picsum.photos/seed/${restaurant.id}/100/100`} 
                            alt={restaurant.name}
                            className="w-10 h-10 rounded-xl border border-gray-100"
                          />
                          <h3 className="font-bold text-lg leading-tight">{restaurant.name}</h3>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                          <span>{restaurant.category}</span>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            <span>30-40 min</span>
                          </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
                          <span className="text-sm font-medium text-green-600">
                            Entrega {restaurant.deliveryFee === 0 ? 'Grátis' : `R$ ${restaurant.deliveryFee.toFixed(2)}`}
                          </span>
                          <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-red-500 transition-colors" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>
            </div>
          )
        )}

        {activeTab === 'orders' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-bold mb-8">Seus Pedidos</h2>
            {!user ? (
              <div className="bg-white p-12 rounded-3xl text-center border border-gray-100 shadow-sm">
                <ShoppingBag className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Faça login para ver seus pedidos</h3>
                <button onClick={handleLogin} className="mt-4 bg-red-500 text-white px-8 py-3 rounded-full font-bold">Entrar</button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-gray-500">Você ainda não tem pedidos realizados.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-bold mb-8">Perfil</h2>
            {user ? (
              <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm max-w-2xl">
                <div className="flex items-center gap-6 mb-8">
                  <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center border-4 border-white shadow-md">
                    <UserIcon className="w-12 h-12 text-gray-400" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">{user.name}</h3>
                    <p className="text-gray-500">{user.email}</p>
                    <span className="inline-block mt-2 px-3 py-1 bg-red-50 text-red-500 text-xs font-bold uppercase rounded-full">
                      {user.role}
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-gray-50 rounded-2xl flex items-center justify-between">
                    <div>
                      <h4 className="font-bold">Endereço de Entrega</h4>
                      <p className="text-sm text-gray-500">{user.address || 'Nenhum endereço cadastrado'}</p>
                    </div>
                    <button className="text-red-500 text-sm font-bold">Editar</button>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-2xl flex items-center justify-between">
                    <div>
                      <h4 className="font-bold">Telefone</h4>
                      <p className="text-sm text-gray-500">{user.phone || 'Nenhum telefone cadastrado'}</p>
                    </div>
                    <button className="text-red-500 text-sm font-bold">Editar</button>
                  </div>
                </div>

                {user.role === 'admin' && (
                  <div className="mt-10 pt-10 border-t border-gray-100">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                      <Shield className="w-6 h-6 text-red-500" />
                      Painel de Administração
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-6 bg-red-50 rounded-3xl border border-red-100">
                        <div className="flex items-center justify-between mb-4">
                          <Store className="w-8 h-8 text-red-500" />
                          <span className="text-2xl font-bold text-red-600">{restaurants.length}</span>
                        </div>
                        <h4 className="font-bold text-red-900">Restaurantes Ativos</h4>
                        <p className="text-sm text-red-600/70">Gerencie os parceiros da plataforma</p>
                        <button className="mt-4 w-full py-2 bg-white text-red-500 rounded-xl font-bold text-sm shadow-sm hover:shadow-md transition-all">
                          Ver Todos
                        </button>
                      </div>
                      <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
                        <div className="flex items-center justify-between mb-4">
                          <ShoppingBag className="w-8 h-8 text-gray-400" />
                          <span className="text-2xl font-bold text-gray-600">0</span>
                        </div>
                        <h4 className="font-bold text-gray-900">Pedidos Hoje</h4>
                        <p className="text-sm text-gray-500">Acompanhe as vendas em tempo real</p>
                        <button className="mt-4 w-full py-2 bg-white text-gray-400 rounded-xl font-bold text-sm shadow-sm cursor-not-allowed">
                          Em breve
                        </button>
                      </div>
                    </div>
                    
                    <div className="mt-6 p-6 bg-white border border-gray-100 rounded-3xl shadow-sm">
                      <h4 className="font-bold mb-4">Ações Rápidas</h4>
                      <div className="flex flex-wrap gap-3">
                        <button 
                          onClick={seedData}
                          className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          Popular Banco de Dados
                        </button>
                        <button className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all flex items-center gap-2">
                          <UserIcon className="w-4 h-4" />
                          Gerenciar Usuários
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <button 
                  onClick={handleLogout}
                  className="mt-10 flex items-center gap-2 text-red-500 font-bold hover:bg-red-50 px-6 py-3 rounded-2xl transition-all"
                >
                  <LogOut className="w-5 h-5" />
                  Sair da conta
                </button>
              </div>
            ) : (
              <div className="bg-white p-12 rounded-3xl text-center border border-gray-100 shadow-sm">
                <UserIcon className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Faça login para ver seu perfil</h3>
                <button onClick={handleLogin} className="mt-4 bg-red-500 text-white px-8 py-3 rounded-full font-bold">Entrar</button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Cart Drawer */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-2xl font-bold">Seu Carrinho</h2>
                <button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                      <ShoppingBag className="w-10 h-10 text-gray-300" />
                    </div>
                    <h3 className="text-lg font-bold mb-1">Seu carrinho está vazio</h3>
                    <p className="text-gray-500">Adicione itens de um restaurante para começar seu pedido.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {cart.map(item => (
                      <div key={item.item.id} className="flex gap-4">
                        <ImageWithSkeleton 
                          src={item.item.imageUrl || `https://picsum.photos/seed/${item.item.id}/100/100`} 
                          alt={item.item.name}
                          className="w-16 h-16 rounded-xl"
                        />
                        <div className="flex-1">
                          <h4 className="font-bold">{item.item.name}</h4>
                          <p className="text-sm text-gray-500 mb-2">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.item.price)}
                          </p>
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => updateQuantity(item.item.id, -1)}
                              className="w-6 h-6 border border-gray-200 rounded-md flex items-center justify-center hover:bg-gray-50"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="font-bold text-sm">{item.quantity}</span>
                            <button 
                              onClick={() => updateQuantity(item.item.id, 1)}
                              className="w-6 h-6 border border-gray-200 rounded-md flex items-center justify-center hover:bg-gray-50"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <button 
                          onClick={() => removeFromCart(item.item.id)}
                          className="text-gray-300 hover:text-red-500"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {cart.length > 0 && (
                <div className="p-6 border-t border-gray-100 bg-gray-50">
                  <div className="space-y-2 mb-6">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span>
                      <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cartTotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Taxa de entrega</span>
                      <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedRestaurant?.deliveryFee || 0)}</span>
                    </div>
                    <div className="flex justify-between text-xl font-bold pt-2 border-t border-gray-200">
                      <span>Total</span>
                      <span className="text-red-500">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cartTotal + (selectedRestaurant?.deliveryFee || 0))}
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={handleCheckout}
                    className="w-full bg-red-500 text-white py-4 rounded-2xl font-bold text-lg hover:bg-red-600 transition-all shadow-lg shadow-red-100"
                  >
                    Finalizar Pedido
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom Navigation (Mobile) */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-3 flex justify-between items-center z-40">
        <button onClick={() => handleTabChange('home')} className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-red-500' : 'text-gray-400'}`}>
          <Store className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">Início</span>
        </button>
        <button onClick={() => handleTabChange('orders')} className={`flex flex-col items-center gap-1 ${activeTab === 'orders' ? 'text-red-500' : 'text-gray-400'}`}>
          <ShoppingBag className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">Pedidos</span>
        </button>
        <button onClick={() => handleTabChange('dashboard')} className={`flex flex-col items-center gap-1 ${activeTab === 'dashboard' ? 'text-red-500' : 'text-gray-400'}`}>
          <LayoutDashboard className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">Painel</span>
        </button>
      </nav>
    </div>
  );
}
