import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert, StyleSheet, ActivityIndicator, Modal, FlatList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
// Feather removido pois não é mais usado
import HeaderPadrao from '../../components/HeaderPadrao';

interface Prova {
  id: string;
  nome: string;
  dataCriacao: string;
  fotos: string[];
  gabarito?: string[];
}

const STORAGE_KEY = '@GabaritoApp:provas';

export default function CadastrarQuestoes() {
  const { provaId } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [respostas, setRespostas] = useState(Array(10).fill(''));
  const [nomeProva, setNomeProva] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const opcoes = ['A', 'B', 'C', 'D', 'E'];
    const [modalVisible, setModalVisible] = useState(false);
    const [questaoSelecionada, setQuestaoSelecionada] = useState<number | null>(null);

  useEffect(() => {
    carregarProva();
  }, []);

  const carregarProva = async () => {
    try {
      const provasArmazenadas = await AsyncStorage.getItem(STORAGE_KEY);
      if (provasArmazenadas) {
        const provas: Prova[] = JSON.parse(provasArmazenadas);
        const provaAtual = provas.find(p => p.id === provaId);
        
        if (provaAtual) {
          setNomeProva(provaAtual.nome);
          // Se já existe um gabarito, carrega as respostas (sempre como array de 10)
          if (provaAtual.gabarito) {
            const arr = Array.isArray(provaAtual.gabarito)
              ? provaAtual.gabarito
              : String(provaAtual.gabarito).split(',').map(a => a.trim().toUpperCase());
            setRespostas([...arr, ...Array(10 - arr.length).fill('')].slice(0, 10));
          } else {
            setRespostas(Array(10).fill(''));
          }
        }
      }
    } catch (error) {
      console.error('Erro ao carregar prova:', error);
      Alert.alert('Erro', 'Não foi possível carregar os dados da prova');
    }
  };

  const atualizarResposta = (index: number, valor: string) => {
    const novasRespostas = [...respostas];
    novasRespostas[index] = valor;
    setRespostas(novasRespostas);
  };

  const salvarGabarito = async () => {
    if (!nomeProva.trim()) {
      Alert.alert('Erro', 'Digite o nome da prova.');
      return;
    }

    if (!user) {
      Alert.alert('Erro', 'Usuário não autenticado');
      return;
    }

    setIsSaving(true);
    try {
      // Salvar no banco de dados
      await api.put(`/api/provas/atualizar-gabarito/${provaId}`, {
        nome: nomeProva.trim(),
        gabarito: respostas
      });

      // Atualizar também no armazenamento local para compatibilidade
      const provasArmazenadas = await AsyncStorage.getItem(STORAGE_KEY);
      let provas: Prova[] = [];
      
      if (provasArmazenadas) {
        provas = JSON.parse(provasArmazenadas);
      }

      const provasAtualizadas = provas.map(prova => {
        if (prova.id === provaId) {
          return {
            ...prova,
            nome: nomeProva.trim(),
            gabarito: respostas
          };
        }
        return prova;
      });

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(provasAtualizadas));
      
      Alert.alert(
        'Sucesso', 
        'Gabarito salvo com sucesso!',
        [
          {
            text: 'OK',
            onPress: () => router.back()
          }
        ]
      );
    } catch (error: any) {
      console.error('Erro ao salvar gabarito:', error);
      let errorMessage = 'Não foi possível salvar o gabarito.';
      
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Erro', errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <HeaderPadrao title="Cadastrar Gabarito" />
      <Text style={styles.label}>Nome da Prova:</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex: Prova de Matemática"
        placeholderTextColor="#999"
        value={nomeProva}
        onChangeText={setNomeProva}
      />

      {respostas.map((resposta, index) => (
        <View key={index} style={styles.card}>
          <Text style={styles.label}>Questão {index + 1}</Text>
          <TouchableOpacity
            style={styles.pickerWrapper}
            onPress={() => {
              setQuestaoSelecionada(index);
              setModalVisible(true);
            }}
          >
            <Text style={[styles.pickerText, !resposta && { color: '#aaa' }]}> {resposta ? ` ${resposta}` : ' Selecione'} </Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* Modal de seleção de alternativa */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
  <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} accessible accessibilityLabel="Fechar seleção" onPress={() => setModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Selecione a alternativa</Text>
            <FlatList
              data={opcoes}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalOption}
                  onPress={() => {
                    if (questaoSelecionada !== null) atualizarResposta(questaoSelecionada, item);
                    setModalVisible(false);
                  }}
                  accessible
                  accessibilityLabel={`Selecionar alternativa ${item}`}
                >
                  <Text style={styles.modalOptionText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      <TouchableOpacity 
        style={[styles.button, isSaving && styles.buttonDisabled]} 
        onPress={salvarGabarito}
        disabled={isSaving}
      >
        {isSaving ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Salvar Gabarito</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffff',
    padding: 20,
    alignItems: 'stretch',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6A0DAD',
    flex: 1,
  },
  label: {
    fontSize: 16,
    color: '#6A0DAD',
    marginBottom: 6,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#e0e0f8',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 20,
    shadowColor: '#6A0DAD',
    shadowOffset: { width: -3, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  card: {
    backgroundColor: '#e8e8ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#b0aaff',
    shadowOffset: { width: -4, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  pickerWrapper: {
    backgroundColor: '#dcdcff',
    borderRadius: 10,
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pickerText: {
    fontSize: 16,
    color: '#6A0DAD',
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6A0DAD',
    marginBottom: 16,
  },
  modalOption: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    width: '100%',
    alignItems: 'center',
  },
  modalOptionText: {
    fontSize: 16,
    color: '#6A0DAD',
  },
  button: {
    backgroundColor: '#6A0DAD',
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 20,
    shadowColor: '#6A0DAD',
    shadowOffset: { width: -3, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
});