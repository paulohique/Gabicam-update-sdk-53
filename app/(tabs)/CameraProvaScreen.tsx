// app/camera-prova.tsx
export const options = { headerShown: false };

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Modal,
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import HeaderPadrao from '../../components/HeaderPadrao';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// 🔹 URL da API de leitura de QR Code
const QR_API_URL = 'http://192.168.18.6:5001/ler-qrcode';

interface Prova {
  id: string;
  nome: string;
  dataCriacao: string;
  fotos: string[];
  gabarito?: string[];
}

interface ImagemCapturada {
  id: string;
  provaId: string;
  nomeAluno: string;
  nomeProva: string;
  imageUri: string;
  dataCriacao: string;
  status: 'pendente' | 'em_analise' | 'corrigido';
  resultado?: {
    acertos: number;
    total: number;
    nota: number;
  };
}

const PROVAS_STORAGE_KEY = '@GabaritoApp:provas';
const IMAGENS_STORAGE_KEY = '@GabaritoApp:imagens';
const NORMALIZED_IMAGES_DIR = `${FileSystem.documentDirectory}normalized_images/`;

export default function CameraProvaScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [cameraPermission, requestCameraPermission] = ImagePicker.useCameraPermissions();
  const [mediaLibraryPermission, requestMediaLibraryPermission] = ImagePicker.useMediaLibraryPermissions();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [provas, setProvas] = useState<Prova[]>([]);
  const [selectedProvaId, setSelectedProvaId] = useState<string>('');
  const [nomeAluno, setNomeAluno] = useState('');
  const [imagens, setImagens] = useState<ImagemCapturada[]>([]);

  const router = useRouter();

  useEffect(() => {
    carregarProvas();
    const setupDirectory = async () => {
      try {
        const dirInfo = await FileSystem.getInfoAsync(NORMALIZED_IMAGES_DIR);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(NORMALIZED_IMAGES_DIR, { intermediates: true });
        }
      } catch (err) {
        console.error('Erro ao criar diretório:', err);
      }
    };
    setupDirectory();
  }, []);

  const carregarProvas = async () => {
    try {
      const provasArmazenadas = await AsyncStorage.getItem(PROVAS_STORAGE_KEY);
      if (provasArmazenadas) {
        const provasData: Prova[] = JSON.parse(provasArmazenadas);
        const provasComGabarito = provasData.filter(p => p.gabarito && p.gabarito.length > 0);
        setProvas(provasComGabarito);
        if (provasComGabarito.length > 0) setSelectedProvaId(provasComGabarito[0].id);
      }
    } catch (error) {
      console.error('Erro ao carregar provas:', error);
      Alert.alert('Erro', 'Não foi possível carregar as provas.');
    }
  };

  const normalizeImage = async (uri: string): Promise<string> => {
    try {
      const normalizedFilename = `PROVA-OCR_${Date.now()}.jpg`;
      const normalizedFilePath = `${NORMALIZED_IMAGES_DIR}${normalizedFilename}`;
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [],
        { compress: 1.0, format: ImageManipulator.SaveFormat.JPEG }
      );
      await FileSystem.copyAsync({ from: manipResult.uri, to: normalizedFilePath });
      if (manipResult.uri !== uri)
        await FileSystem.deleteAsync(manipResult.uri, { idempotent: true });
      return normalizedFilePath;
    } catch (error) {
      console.error('Erro ao normalizar imagem:', error);
      throw error;
    }
  };

  const handleImageSelection = async (uri: string) => {
    setIsProcessing(true);
    try {
      const processedImageUri = await normalizeImage(uri);
      setImageUri(processedImageUri);
    } catch {
      Alert.alert('Erro', 'Não foi possível processar a imagem.');
      setImageUri(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const validarFormulario = () => {
    if (!selectedProvaId) {
      Alert.alert('Atenção', 'Selecione uma prova/gabarito para continuar.');
      return false;
    }
    return true;
  };

  const usarCamera = async () => {
    if (!validarFormulario()) return;
    const { status } = await requestCameraPermission();
    if (status !== 'granted') {
      Alert.alert('Permissão negada', 'Precisamos de permissão para acessar a câmera.');
      return;
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 5],
        quality: 1,
      });
      if (!result.canceled) await handleImageSelection(result.assets[0].uri);
    } catch (error) {
      console.error('Erro ao usar a câmera:', error);
      Alert.alert('Erro', 'Não foi possível iniciar a câmera.');
    }
  };

  const selecionarDaGaleria = async () => {
    if (!validarFormulario()) return;
    const { status } = await requestMediaLibraryPermission();
    if (status !== 'granted') {
      Alert.alert('Permissão negada', 'Precisamos de permissão para acessar a galeria.');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 5],
        quality: 1,
      });
      if (!result.canceled) await handleImageSelection(result.assets[0].uri);
    } catch (error) {
      console.error('Erro ao selecionar da galeria:', error);
      Alert.alert('Erro', 'Não foi possível abrir a galeria.');
    }
  };

  const salvarImagem = async () => {
    if (!imageUri) {
      Alert.alert('Erro', 'Nenhuma imagem para salvar.');
      return;
    }
    setIsSaving(true);
    try {
      const provaSelecionada = provas.find(p => p.id === selectedProvaId);
      if (!provaSelecionada) throw new Error('Prova não encontrada');

      const novaImagem: ImagemCapturada = {
        id: Date.now().toString(),
        provaId: selectedProvaId,
        nomeAluno: nomeAluno.trim(),
        nomeProva: provaSelecionada.nome,
        imageUri,
        dataCriacao: new Date().toLocaleDateString('pt-BR'),
        status: 'pendente',
      };

      const imagensArmazenadas = await AsyncStorage.getItem(IMAGENS_STORAGE_KEY);
      const imagens: ImagemCapturada[] = imagensArmazenadas ? JSON.parse(imagensArmazenadas) : [];
      imagens.push(novaImagem);
      await AsyncStorage.setItem(IMAGENS_STORAGE_KEY, JSON.stringify(imagens));

      const provasArmazenadas = await AsyncStorage.getItem(PROVAS_STORAGE_KEY);
      if (provasArmazenadas) {
        const provasData: Prova[] = JSON.parse(provasArmazenadas);
        const provasAtualizadas = provasData.map(p => {
          if (p.id === selectedProvaId) p.fotos = [...(p.fotos || []), imageUri];
          return p;
        });
        await AsyncStorage.setItem(PROVAS_STORAGE_KEY, JSON.stringify(provasAtualizadas));
      }

      // 🔍 Chamar API do QR code
      let apiMessage = '';
      try {
        console.log('🔍 Iniciando chamada para API QR code...');
        console.log('📸 Image URI:', imageUri);
        console.log('🌐 API URL:', QR_API_URL);

        // Verificar se o arquivo existe
        const fileInfo = await FileSystem.getInfoAsync(imageUri);
        console.log('📁 File info:', fileInfo);

        const formData = new FormData();
        formData.append('imagem', {
          uri: imageUri,
          type: 'image/jpeg',
          name: 'prova.jpg',
        } as any);

        console.log('📦 FormData criado, enviando requisição...');

        // Primeira tentativa: FormData
        let response = await fetch(QR_API_URL, { 
          method: 'POST', 
          body: formData,
          // Não definir Content-Type manualmente - deixar o fetch definir para multipart
        });

        // Se falhar, tentar com base64
        if (!response.ok && response.status !== 404) {
          console.log('🔄 FormData falhou, tentando com base64...');
          
          const base64 = await FileSystem.readAsStringAsync(imageUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          
          response = await fetch(QR_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              imagem_base64: base64,
              filename: 'prova.jpg'
            }),
          });
          
          console.log('📡 Base64 response status:', response.status);
        }

        console.log('📡 Response status:', response.status);
        console.log('📋 Response headers:', response.headers);

        if (response.ok) {
          const data = await response.json();
          console.log('✅ Response data:', data);
          
          const nomeDetectado = data.nomeAluno || data.nome;
          if (nomeDetectado) {
            setNomeAluno(nomeDetectado);
            apiMessage = `Nome detectado: ${nomeDetectado}`;
            // Atualiza AsyncStorage com o nome lido
            const imgs = await AsyncStorage.getItem(IMAGENS_STORAGE_KEY);
            if (imgs) {
              const parsedImgs: ImagemCapturada[] = JSON.parse(imgs);
              const index = parsedImgs.findIndex(img => img.imageUri === imageUri);
              if (index !== -1) {
                parsedImgs[index].nomeAluno = nomeDetectado;
                await AsyncStorage.setItem(IMAGENS_STORAGE_KEY, JSON.stringify(parsedImgs));
                setImagens(parsedImgs);
              }
            }
          } else apiMessage = 'Nenhum nome foi detectado.';
        } else {
          const errorText = await response.text();
          console.error('❌ API Error:', response.status, errorText);
          apiMessage = `Erro da API: ${response.status} - ${errorText}`;
        }
      } catch (err) {
        console.error('❌ Erro completo na API QR code:', err);
        apiMessage = `Erro ao executar a API de QR Code: ${err}`;
      }

      Alert.alert('Resultado da Leitura', apiMessage);
      router.back();
    } catch (error: any) {
      console.error('Erro ao salvar imagem:', error);
      Alert.alert('Erro', `Não foi possível salvar a imagem: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const renderFormulario = () => (
    <ScrollView contentContainerStyle={styles.formContainer}>
      <View style={styles.formHeader}>
        <Text style={styles.formTitle}>Nova Captura</Text>
        <Text style={styles.formSubtitle}>Selecione a prova/gabarito antes de capturar</Text>
      </View>
      <View style={styles.formCard}>
        <Text style={styles.formLabel}>Selecione a Prova/Gabarito</Text>
        {provas.length > 0 ? (
          <>
            <TouchableOpacity
              style={styles.customPickerButton}
              onPress={() => setModalVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.customPickerButtonText}>
                {provas.find(p => p.id === selectedProvaId)?.nome || 'Selecione a prova/gabarito'}
              </Text>
            </TouchableOpacity>

            <Modal visible={modalVisible} transparent animationType="fade">
              <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Selecione a prova/gabarito</Text>
                  <ScrollView style={{ maxHeight: 300 }}>
                    {provas.map(prova => (
                      <TouchableOpacity
                        key={prova.id}
                        style={[
                          styles.modalOption,
                          selectedProvaId === prova.id && styles.modalOptionSelected,
                        ]}
                        onPress={() => {
                          setSelectedProvaId(prova.id);
                          setModalVisible(false);
                        }}
                      >
                        <Text style={styles.modalOptionText}>{prova.nome}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity style={styles.modalCancelButton} onPress={() => setModalVisible(false)}>
                    <Text style={styles.modalCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Modal>
          </>
        ) : (
          <View style={styles.emptyProvasContainer}>
            <Text style={styles.emptyProvasText}>Nenhuma prova encontrada</Text>
            <TouchableOpacity
              style={styles.createProvaButton}
              onPress={() => router.push('/CriarEditarProvaScreen')}
            >
              <Text style={styles.createProvaButtonText}>Criar Prova</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.captureOptions}>
          <TouchableOpacity
            style={[styles.captureButton, !selectedProvaId && styles.captureButtonDisabled]}
            onPress={usarCamera}
            disabled={!selectedProvaId}
          >
            <Feather name="camera" size={20} color="#FFF" />
            <Text style={styles.captureButtonText}>Usar Câmera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.captureButton, styles.galleryButton, !selectedProvaId && styles.captureButtonDisabled]}
            onPress={selecionarDaGaleria}
            disabled={!selectedProvaId}
          >
            <Feather name="image" size={20} color="#FFF" />
            <Text style={styles.captureButtonText}>Selecionar da Galeria</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );

  const renderPreview = () => (
    <View style={styles.previewContainer}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={styles.previewLabel}>Imagem Capturada</Text>
        {isProcessing ? (
          <ActivityIndicator size="large" color="#FFF" />
        ) : (
          imageUri ? (
            <>
              <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
              {nomeAluno ? (
                <Text style={{ color: '#00FFAA', textAlign: 'center', fontSize: 16, marginTop: 8 }}>
                  Aluno detectado: {nomeAluno}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={{ color: '#FFF', textAlign: 'center' }}>Nenhuma imagem selecionada.</Text>
          )
        )}
      </View>
      <View style={styles.previewActions}>
        <TouchableOpacity
          style={[styles.previewButton, styles.cancelButton]}
          onPress={() => setImageUri(null)}
          disabled={isSaving}
        >
          <Feather name="x" size={20} color="#FF6B6B" />
          <Text style={styles.cancelText}>Descartar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.previewButton, styles.saveButton, (isSaving || !imageUri) && styles.saveButtonDisabled]}
          onPress={salvarImagem}
          disabled={isSaving || !imageUri}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Feather name="check" size={20} color="#FFF" />
              <Text style={styles.saveText}>Salvar</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  if (!cameraPermission || !mediaLibraryPermission)
    return <View style={styles.centerContainer}><ActivityIndicator size="large" color="#2F4FCD" /></View>;

  if (!cameraPermission.granted || !mediaLibraryPermission.granted)
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.permissionText}>Precisamos de permissão para câmera e galeria.</Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={() => {
            requestCameraPermission();
            requestMediaLibraryPermission();
          }}
        >
          <Text style={styles.permissionButtonText}>Conceder Permissões</Text>
        </TouchableOpacity>
      </View>
    );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style={imageUri ? 'light' : 'dark'} />
      <HeaderPadrao title="Capturar Prova" />
      {imageUri ? renderPreview() : (
        <ScrollView contentContainerStyle={styles.content}>{renderFormulario()}</ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  content: { padding: 20 },
  formContainer: { padding: 20 },
  formHeader: { marginBottom: 30 },
  formTitle: { fontSize: 24, fontWeight: 'bold', color: '#2F4FCD', marginBottom: 8 },
  formSubtitle: { fontSize: 16, color: '#666' },
  formCard: {
    backgroundColor: '#F0F2F5',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  formLabel: { fontSize: 14, fontWeight: '500', color: '#2F4FCD', marginBottom: 8, marginTop: 16 },
  customPickerButton: {
    borderWidth: 1, borderColor: '#2F4FCD', borderRadius: 8, paddingVertical: 12,
    paddingHorizontal: 16, marginBottom: 12, backgroundColor: '#F5F6FA',
  },
  customPickerButtonText: { color: '#2F4FCD', fontSize: 16, fontWeight: 'bold' },
  captureOptions: { marginTop: 24 },
  captureButton: {
    backgroundColor: '#2F4FCD', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12, marginBottom: 12, elevation: 2,
  },
  galleryButton: { backgroundColor: '#27AE60' },
  captureButtonDisabled: { backgroundColor: '#B0BEC5', elevation: 0 },
  captureButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
  previewContainer: { flex: 1, backgroundColor: '#0F1624', justifyContent: 'space-between', padding: 20 },
  previewLabel: { color: '#FFF', fontSize: 20, textAlign: 'center', fontWeight: 'bold', marginBottom: 16 },
  previewImage: { width: SCREEN_WIDTH - 40, height: SCREEN_WIDTH * 1.1, alignSelf: 'center', borderRadius: 12 },
  previewActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  previewButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flex: 1, paddingVertical: 14, borderRadius: 12 },
  cancelButton: { backgroundColor: '#FFF', marginRight: 8 },
  saveButton: { backgroundColor: '#2F4FCD', marginLeft: 8 },
  saveButtonDisabled: { backgroundColor: '#6B7CFF' },
  cancelText: { color: '#FF6B6B', fontWeight: 'bold', fontSize: 16, marginLeft: 6 },
  saveText: { color: '#FFF', fontWeight: 'bold', fontSize: 16, marginLeft: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#2F4FCD', marginBottom: 12 },
  modalOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  modalOptionSelected: { backgroundColor: '#E0E7FF' },
  modalOptionText: { fontSize: 16, color: '#333' },
  modalCancelButton: { marginTop: 12, alignItems: 'center' },
  modalCancelText: { color: '#2F4FCD', fontWeight: 'bold', fontSize: 16 },
  emptyProvasContainer: { alignItems: 'center', justifyContent: 'center', marginVertical: 20 },
  emptyProvasText: { color: '#999', marginBottom: 10 },
  createProvaButton: { backgroundColor: '#2F4FCD', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  createProvaButtonText: { color: '#FFF', fontWeight: 'bold' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  permissionText: { color: '#333', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  permissionButton: { backgroundColor: '#2F4FCD', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  permissionButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
});
