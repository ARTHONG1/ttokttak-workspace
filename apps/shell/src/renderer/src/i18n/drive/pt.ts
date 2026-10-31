import type { zh } from './zh'

export const pt = {
  driveNav: 'Google Drive',
  driveDesc:
    'Abra e edite seus arquivos do Drive no GenOffice; ao salvar, eles voltam para o Drive. Você também pode deixar a IA encontrar e ler arquivos no seu Drive.',
  driveConnect: 'Conectar o Google Drive',
  driveConnecting: 'Entre na sua conta Google no navegador e permita o acesso…',
  driveCancel: 'Cancelar',
  driveConnectedAs: 'Conectado como {email}',
  driveDisconnect: 'Desconectar',
  driveDisconnectConfirm:
    'Isso remove o login do Drive deste PC e pede ao Google que revogue o acesso do GenOffice. As cópias que já estão neste PC permanecem.',
  driveDisconnectYes: 'Desconectar',
  driveNotPersisted:
    'Este PC não consegue guardar o login criptografado, então a conexão termina quando você fecha o aplicativo.',
  driveExpired:
    'O Google encerrou a conexão: o acesso foi removido ou o login expirou. Conecte novamente.',
  driveAiAccess: 'Deixar a IA encontrar e ler arquivos no Drive',
  driveAiAccessDesc:
    'Quando ativado, a IA dos editores pode pesquisar em todo o seu Drive e ler o texto dos arquivos. O que ela lê vai para o provedor de IA que você usa. A IA não pode alterar, excluir nem compartilhar arquivos do Drive.',
  drivePrivacy:
    'Listas e conteúdo de arquivos trafegam apenas entre este PC e o Google. Nunca passam por um servidor dos criadores do GenOffice.',
  driveFailDenied: 'A conexão não foi feita porque o Google não a permitiu.',
  driveFailScope:
    'A conexão não foi feita porque o acesso ao Drive não foi marcado. Conecte novamente e marque o item do Drive.',
  driveFailTimeout: 'O login não terminou em 10 minutos. Tente novamente.',
  driveFailNetwork:
    'Não foi possível acessar o Google. Verifique sua conexão com a internet e tente novamente.',
  driveMyDrive: 'Meu Drive',
  driveShared: 'Compartilhados comigo',
  driveRecent: 'Recentes',
  driveSearchPlaceholder: 'Pesquisar no Drive',
  driveSearchResults: 'Resultados para “{q}”',
  driveRefresh: 'Atualizar',
  driveNotConnectedTitle: 'O Google Drive não está conectado',
  driveNotConnectedBody:
    'Depois de conectar, você pode abrir e editar arquivos do Drive aqui, e ao salvar eles voltam para o Drive.',
  driveOpenSettings: 'Conectar nas Configurações',
  driveEmpty: 'Nenhum arquivo.',
  driveLoading: 'Carregando…',
  driveLoadMore: 'Mostrar mais',
  driveOpening: 'Abrindo…',
  driveGoogleBadge: 'Formato Google',
  driveGoogleNote:
    'Um documento do Google abre como arquivo do Office. Ao salvar, o original fica como está e um arquivo do Office é salvo na mesma pasta.',
  driveReadOnly: 'Somente leitura',
  driveReadOnlyNote:
    'Você não pode editar este arquivo. Ao salvar, será perguntado se deseja salvar uma cópia no Drive.',
  driveUnsupported: 'Este aplicativo não consegue abrir este tipo de arquivo.',
  driveErrNotConnected: 'O Google Drive foi desconectado. Conecte novamente nas Configurações.',
  driveErrNotFound: 'Arquivo não encontrado. Ele foi excluído ou esta conta não consegue vê-lo.',
  driveErrForbidden: 'Esta conta não tem permissão para baixar este arquivo.',
  driveErrTooLarge: 'O arquivo é grande demais para abrir.',
  driveErrRateLimit:
    'O Google está segurando as solicitações por um momento. Tente novamente em instantes.',
  driveErrNetwork: 'Não foi possível acessar o Google Drive. Verifique sua conexão com a internet.',
  driveErrDisk: 'Não foi possível salvar o arquivo neste PC.',
  drivePickTitle: 'Anexar do Drive',
  drivePickAttach: 'Anexar',
  drivePickSelected: '{n} selecionado(s)',
  drivePickWorking: 'Buscando arquivos no Drive…',
  drivePickFolderNote: 'Marcar uma pasta anexa até 20 arquivos dela.',
  drivePickGoogleNote: 'Um documento do Google é anexado como arquivo do Office.',
} satisfies Record<keyof typeof zh, string>
