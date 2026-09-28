"""
QRISK-Console ML Pipeline — Quantum Feature Map
==================================================
Needs: pip install pennylane  (see requirements.txt)

Uses the WDBC dataset (via pca_analysis.py) with:
  - 6 selected clinical features → PCA to 4 components → 4 qubits
  - AngleEmbedding (rotation="Y") for data encoding
  - StronglyEntanglingLayers (3 layers) with FIXED (untrained) weights

This module does NOT predict anything by itself. It transforms classical
PCA features into quantum-transformed features by measuring
expval(PauliZ(i)) on every qubit. The transformed features are then
passed to a classical classifier (XGBoost) to form the hybrid pipeline.

This matches how real quantum feature maps (e.g. Qiskit's ZFeatureMap)
work in the literature — the circuit's job is to re-express the data in
a new Hilbert space, not to learn a decision boundary itself.
"""

import numpy as np
import pennylane as qml


class QuantumFeatureMap:
    """Quantum feature map: transforms classical features via a parameterized
    quantum circuit with fixed (non-trainable) weights.

    Parameters
    ----------
    n_qubits : int
        Number of qubits (must match the dimensionality of the input features,
        i.e. the number of PCA components — 4 in our pipeline).
    n_layers : int
        Number of StronglyEntanglingLayers in the circuit.
    seed : int
        Random seed used to generate the fixed circuit weights. Using the
        same seed guarantees identical transformations across train/test/
        inference — critical for reproducibility.
    """

    def __init__(self, n_qubits: int = 4, n_layers: int = 3, seed: int = 42):
        self.n_qubits = n_qubits
        self.n_layers = n_layers
        self.seed = seed

        # Fixed (untrained) circuit weights — seeded once, never learned
        rng = np.random.default_rng(seed)
        weight_shape = qml.StronglyEntanglingLayers.shape(
            n_layers=n_layers, n_wires=n_qubits
        )
        self.weights = rng.uniform(0, 2 * np.pi, size=weight_shape)

        # Build the quantum device and circuit
        self.dev = qml.device("default.qubit", wires=n_qubits)

        @qml.qnode(self.dev)
        def circuit(weights, x):
            qml.AngleEmbedding(x, wires=range(n_qubits), rotation="Y")
            qml.StronglyEntanglingLayers(weights, wires=range(n_qubits))
            # Measure expval(PauliZ) on EVERY qubit — one new feature per qubit
            return [qml.expval(qml.PauliZ(i)) for i in range(n_qubits)]

        self.circuit = circuit

    def transform_single(self, x: np.ndarray) -> np.ndarray:
        """Transform a single input vector through the quantum circuit.

        Parameters
        ----------
        x : np.ndarray, shape (n_qubits,)
            A single angle-encoded PCA feature vector.

        Returns
        -------
        np.ndarray, shape (n_qubits,)
            Quantum-transformed features (one per qubit).
        """
        return np.array(self.circuit(self.weights, x))

    def transform(self, X: np.ndarray) -> np.ndarray:
        """Transform a batch of input vectors through the quantum circuit.

        Parameters
        ----------
        X : np.ndarray, shape (n_samples, n_qubits)
            Batch of angle-encoded PCA feature vectors.

        Returns
        -------
        np.ndarray, shape (n_samples, n_qubits)
            Quantum-transformed features for each sample.
        """
        return np.array([self.transform_single(x) for x in X])
