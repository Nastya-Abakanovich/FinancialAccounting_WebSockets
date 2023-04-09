import React, {useEffect, useState} from 'react';
import InputForm from '../components/InputForm';
import DataTable from '../components/DataTable';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useNavigate } from 'react-router-dom';
import socket from '../socket';


function HomePage() {
    const [items, setItems] = useState(null);
    const [updItem, setUpdItem] = useState(null);
    const navigate = useNavigate(); 

    useEffect(() => {
      socket.timeout(5000).emit('getData');
      socket.on('getDataResponse', (message) => {
        if (message !== 'Getting data error') {
          setItems(message);
        }
      });

      socket.on('goToSignIn', () => {
        navigate('/signIn');
      });

      socket.on('addResponse', handleAddResponse);
      socket.on('updateResponse', handleUpdateResponse);
      socket.on('getFileResponse', handleGetFileResponse);
    
      return () => {
        socket.off('addResponse', handleAddResponse);
        socket.off('updateResponse', handleUpdateResponse);
        socket.off('getFileResponse', handleGetFileResponse);
      };
    }, []);

    const handleAddResponse = (message) => {
      console.log(message);
      if (message !== 'Adding error') {
        const newBody = { ...message.body };
        newBody["spending_id"] = message.id;
        newBody["sum"] *= 100;
        newBody["filename"] = message.filename ? message.filename : null;
        setItems((items) => [...items, newBody]);    
      }
    };

    const handleUpdateResponse = (message) => {
      console.log(message);
      if (message !== 'Updating error') {
        setUpdItem(null);
          if (message.filename !== null)
            setItems(prevItems => prevItems.map(item => item.spending_id === message.body.spending_id ? 
              { ...item, sum: message.body.sum * 100, user_id: message.user_id, category: message.body.category, 
                description: message.body.description, income: message.body.type === "income" ? 1 : 0, date: new Date(message.body.date), 
                filename: message.filename} : item));
          else
          setItems(prevItems => prevItems.map(item => item.spending_id === message.body.spending_id ? 
            { ...item, sum: message.body.sum * 100, user_id: message.user_id, category: message.body.category, 
              description: message.body.description, income: message.body.type === "income" ? 1 : 0, date: new Date(message.body.date)} : item));
      }
    };

    const handleGetFileResponse =  (message) => {
      if (message !== 'Getting file error') {
        try {
          console.log(message.file);
          const fileBlob = new Blob([message.file]);
          
          const fileType = message.filename.split('.').pop().toLowerCase();
          const fileUrlObject = URL.createObjectURL(fileBlob);
          const newWindow = window.open('', '_blank');
          
          if (fileType === 'jpg' || fileType === 'png' || fileType === 'gif') {
            newWindow.document.write(`<img src="${fileUrlObject}" />`);
          } else if (fileType === 'mp4' || fileType === 'avi' || fileType === 'mov') {
            newWindow.document.write(`<video src="${fileUrlObject}" autoplay controls></video>`);
          } else {
            const reader = new FileReader();
            reader.onload = () => {
              const text = reader.result;
              newWindow.document.write(text);
            };
            reader.readAsText(fileBlob);
          }
        } catch (error) {
          console.error(error);
        }
       }
    };

    const deleteItem = (id) => {
      socket.emit('delete', id);
      socket.on('deleteResponse', (message) => {
        if (message === 'Successfully deleted') {
          setItems(actualItems => actualItems.filter(data => data.spending_id !== id));
        }
      });
    };
  
    const deleteFile = (id) => { 
      socket.emit('deleteFile', id);
      socket.on('deleteFileResponse', (message) => {
        if (message === 'Successfully deleted file') {
          setItems(prevItems => prevItems.map(item => item.spending_id === id ? { ...item, filename: null } : item));
        }
      });
    };
  
    const fillForm = async (item) => {
      setUpdItem(item);
    };
  
    const addItems = (body, selectedFile) => { 
      socket.emit('add', body, selectedFile ? {name: selectedFile.name, info: selectedFile} : null);
    };
  
    const updateItems = (body, selectedFile) => { 
      socket.emit('update', body, selectedFile ? {name: selectedFile.name, info: selectedFile} : null);
    };

    const openFile = (id) => { 
      socket.emit('getFile', id);
    };

    function ShowPage() {
      if (items !== null) {
        return (
        <div className="content">
          <InputForm 
            addItems={addItems}
            updateItems={updateItems}
            updItem={updItem}
          />
          <DataTable 
            items={items}
            onClickDelete={deleteItem}
            onClickUpdate={fillForm}
            deleteFile={deleteFile}
            openFile={openFile}
          />   
        </div> )   
      } else {
            return <p></p> 
      }
    }
  
    return (
        <div className="wrapper">
            <Header/>
            <ShowPage/>             
            <Footer/>  
        </div>
    )
  }
  
  export default HomePage; 