import { Text } from '@react-three/drei';

interface BuildingLabelProps {
  text: string;
  position: [number, number, number];
  rank?: number;
}

export default function BuildingLabel({ text, position, rank }: BuildingLabelProps) {
  const showRank = typeof rank === 'number' && rank > 0 && rank <= 99;
  return (
    <group position={position}>
      {showRank && (
        <Text
          position={[0, 0.55, 0]}
          fontSize={0.42}
          color={rank <= 3 ? '#f6821f' : '#0f172a'}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.05}
          outlineColor="#ffffff"
          fontWeight={800}
        >
          {`#${rank}`}
        </Text>
      )}
      <Text
        position={[0, 0, 0]}
        fontSize={0.3}
        color="#0f172a"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.04}
        outlineColor="#ffffff"
        maxWidth={8}
      >
        {text}
      </Text>
    </group>
  );
}
