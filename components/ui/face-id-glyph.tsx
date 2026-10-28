import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

const faceIdSource = require('../../assets/images/ui/face-id-source.png');

export function FaceIdGlyph({
  size = 32,
  color = '#5B8DFF',
}: {
  size?: number;
  color?: string;
}) {
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <Image
        source={faceIdSource}
        style={[
          styles.image,
          {
            width: size,
            height: size,
            tintColor: color,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'relative',
  },
  image: {
    resizeMode: 'contain',
  },
});
