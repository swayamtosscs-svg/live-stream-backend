// server.js - Complete Backend Code
const express = require('express');
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Environment variables se lein (Railway mein set karenge)
const APP_ID = process.env.AGORA_APP_ID || 'e241f417bbd040858556fbbb51ddc8c1';
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE || 'b6ca0bbd58264c988df0166831705e67';

// In-memory storage (production mein database use karein)
let liveStreams = new Map();

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'Live Stream Server Running',
    activeStreams: liveStreams.size 
  });
});

// Token generate endpoint
app.post('/api/token', (req, res) => {
  try {
    const { channelName, uid, role } = req.body;
    
    if (!channelName) {
      return res.status(400).json({ error: 'Channel name is required' });
    }

    const userRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const expirationTime = 3600; // 1 hour
    const currentTime = Math.floor(Date.now() / 1000);
    const privilegeExpireTime = currentTime + expirationTime;
    const uidNum = uid || 0;

    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      uidNum,
      userRole,
      privilegeExpireTime
    );

    res.json({ 
      token, 
      appId: APP_ID,
      channelName,
      uid: uidNum,
      expireTime: privilegeExpireTime
    });
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// Start live stream
app.post('/api/live/start', (req, res) => {
  try {
    const { userId, username, channelName, title, thumbnail } = req.body;
    
    if (!channelName || !username) {
      return res.status(400).json({ error: 'Channel name and username required' });
    }

    const streamData = {
      id: channelName,
      userId: userId || 'anonymous',
      username,
      title: title || 'Live Stream',
      thumbnail: thumbnail || '',
      viewers: 0,
      startedAt: new Date().toISOString(),
      isLive: true,
      likes: 0,
      comments: []
    };
    
    liveStreams.set(channelName, streamData);
    
    res.json({ 
      success: true, 
      stream: streamData,
      message: 'Live stream started successfully' 
    });
  } catch (error) {
    console.error('Start stream error:', error);
    res.status(500).json({ error: 'Failed to start stream' });
  }
});

// End live stream
app.post('/api/live/end', (req, res) => {
  try {
    const { channelName } = req.body;
    
    if (!channelName) {
      return res.status(400).json({ error: 'Channel name required' });
    }

    if (liveStreams.has(channelName)) {
      const stream = liveStreams.get(channelName);
      liveStreams.delete(channelName);
      
      res.json({ 
        success: true,
        message: 'Live stream ended',
        duration: Date.now() - new Date(stream.startedAt).getTime(),
        finalViewers: stream.viewers
      });
    } else {
      res.status(404).json({ error: 'Stream not found' });
    }
  } catch (error) {
    console.error('End stream error:', error);
    res.status(500).json({ error: 'Failed to end stream' });
  }
});

// Get all active live streams
app.get('/api/live/active', (req, res) => {
  try {
    const active = Array.from(liveStreams.values())
      .filter(stream => stream.isLive)
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    
    res.json({ 
      success: true,
      count: active.length,
      streams: active 
    });
  } catch (error) {
    console.error('Get active streams error:', error);
    res.status(500).json({ error: 'Failed to fetch streams' });
  }
});

// Get specific stream info
app.get('/api/live/stream/:channelName', (req, res) => {
  try {
    const { channelName } = req.params;
    
    if (liveStreams.has(channelName)) {
      res.json({ 
        success: true,
        stream: liveStreams.get(channelName) 
      });
    } else {
      res.status(404).json({ error: 'Stream not found' });
    }
  } catch (error) {
    console.error('Get stream error:', error);
    res.status(500).json({ error: 'Failed to fetch stream' });
  }
});

// Update viewer count
app.post('/api/live/viewer', (req, res) => {
  try {
    const { channelName, increment } = req.body;
    
    if (!channelName) {
      return res.status(400).json({ error: 'Channel name required' });
    }

    if (liveStreams.has(channelName)) {
      const stream = liveStreams.get(channelName);
      stream.viewers += increment ? 1 : -1;
      stream.viewers = Math.max(0, stream.viewers);
      liveStreams.set(channelName, stream);
      
      res.json({ 
        success: true, 
        viewers: stream.viewers,
        channelName 
      });
    } else {
      res.status(404).json({ error: 'Stream not found' });
    }
  } catch (error) {
    console.error('Update viewer error:', error);
    res.status(500).json({ error: 'Failed to update viewer count' });
  }
});

// Add comment to stream
app.post('/api/live/comment', (req, res) => {
  try {
    const { channelName, username, comment } = req.body;
    
    if (!channelName || !username || !comment) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (liveStreams.has(channelName)) {
      const stream = liveStreams.get(channelName);
      const newComment = {
        id: Date.now().toString(),
        username,
        comment,
        timestamp: new Date().toISOString()
      };
      
      stream.comments.push(newComment);
      
      // Keep only last 50 comments
      if (stream.comments.length > 50) {
        stream.comments = stream.comments.slice(-50);
      }
      
      liveStreams.set(channelName, stream);
      
      res.json({ 
        success: true, 
        comment: newComment 
      });
    } else {
      res.status(404).json({ error: 'Stream not found' });
    }
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Get comments for stream
app.get('/api/live/comments/:channelName', (req, res) => {
  try {
    const { channelName } = req.params;
    
    if (liveStreams.has(channelName)) {
      const stream = liveStreams.get(channelName);
      res.json({ 
        success: true,
        comments: stream.comments 
      });
    } else {
      res.status(404).json({ error: 'Stream not found' });
    }
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Like stream
app.post('/api/live/like', (req, res) => {
  try {
    const { channelName } = req.body;
    
    if (!channelName) {
      return res.status(400).json({ error: 'Channel name required' });
    }

    if (liveStreams.has(channelName)) {
      const stream = liveStreams.get(channelName);
      stream.likes += 1;
      liveStreams.set(channelName, stream);
      
      res.json({ 
        success: true, 
        likes: stream.likes 
      });
    } else {
      res.status(404).json({ error: 'Stream not found' });
    }
  } catch (error) {
    console.error('Like stream error:', error);
    res.status(500).json({ error: 'Failed to like stream' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Live Stream Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/`);
});
