"""
PerckyLingua - Application Streamlit
Point d'entrée principal du frontend Python
"""

import streamlit as st
from services.api_client import api

st.set_page_config(
    page_title="PerckyLingua",
    page_icon="🇮🇹",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Style CSS personnalisé
st.markdown("""
<style>
    .main-header {
        font-size: 2.2rem;
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 0.2rem;
    }
    .sub-header {
        font-size: 1.05rem;
        color: #64748b;
        margin-bottom: 1.5rem;
    }
    .metric-card {
        background-color: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 16px;
        text-align: center;
    }
</style>
""", unsafe_allow_html=True)

st.markdown('<div class="main-header">🇮🇹 PerckyLingua</div>', unsafe_allow_html=True)
st.markdown('<div class="sub-header">Plateforme complète de gestion et d\'évaluation des examens oraux d\'italien pour enseignants</div>', unsafe_allow_html=True)

col1, col2, col3 = st.columns([1, 1, 1])

with col1:
    st.subheader("📚 Gestion Pédagogique")
    st.write("• Gestion des classes et des listes d'élèves")
    st.write("• Importation CSV et JSON avec détection des doublons")
    st.write("• Modèles d'examens oraux (Exemple : *Lo zébu*)")

with col2:
    st.subheader("🎙️ Évaluation Orale Rapide")
    st.write("• Notation rubrique par rubrique en 1 clic")
    st.write("• Questions et phrases attendues en italien")
    st.write("• Calcul automatique instantané de la note sur 10")

with col3:
    st.subheader("📊 Résultats & Tirage au sort")
    st.write("• Générateur d'ordre de passage aléatoire")
    st.write("• Dashboard statistique avec graphiques Plotly")
    st.write("• Exports CSV, JSON et fiches individuelles PDF")

st.info("Utilisez le menu latéral pour naviguer entre les différentes sections de l'application.")
