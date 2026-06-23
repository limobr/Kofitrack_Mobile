import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TransactionsScreen from './TransactionsScreen';

export default function TransactionsTabHost() {
  const [type, setType] = useState<'cherry' | 'mbuni'>('cherry');

  return (
    <View style={styles.container}>
      <View style={styles.typeToggle}>
        <TouchableOpacity
          onPress={() => setType('cherry')}
          style={[styles.toggleBtn, type === 'cherry' && styles.activeToggle]}
        >
          <Ionicons name="leaf" size={14} color={type === 'cherry' ? '#fff' : '#8c6239'} />
          <Text style={[styles.toggleText, type === 'cherry' && styles.activeToggleText]}>Cherry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setType('mbuni')}
          style={[styles.toggleBtn, type === 'mbuni' && styles.activeToggle]}
        >
          <Ionicons name="leaf" size={14} color={type === 'mbuni' ? '#fff' : '#8c6239'} />
          <Text style={[styles.toggleText, type === 'mbuni' && styles.activeToggleText]}>Mbuni</Text>
        </TouchableOpacity>
      </View>

      <TransactionsScreen key={type} type={type} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf9f6' },
  typeToggle: { flexDirection: 'row', marginHorizontal: 12, marginTop: 8, marginBottom: 4, gap: 6 },
  toggleBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#d9d0c7', backgroundColor: '#fff' },
  activeToggle: { backgroundColor: '#3d2b1f', borderColor: '#3d2b1f' },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#3d2b1f', marginLeft: 4 },
  activeToggleText: { color: '#fff' },
});