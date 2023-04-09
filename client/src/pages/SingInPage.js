import React, {useEffect, useState} from 'react';
import io from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import SignInForm from '../components/SignInForm';
import socket from '../socket';

function SignInPage() {

    const [err, setErr] = useState(null); 
    const navigate = useNavigate();   
    
    const signIn = async (body) => {     
        socket.timeout(5000).emit('login', { email: body.email, password: body.password});
        socket.on('loginResponse', (data) => {
            console.log(data)
            if (data !== 'Login error') {
                if (data === 'Invalid password' || data === 'User not found') {
                    setErr('Неверно указан email или пароль');
                } else {
                    console.log(data);
                    document.cookie = data.token + '; max-age=3600; path=/;';
                    document.cookie = data.id + '; max-age=3600; path=/;';
                    console.log(document.cookie);
                    setErr(null);

                    navigate("/");
                    window.location.reload();                    
                }
            }
        });
    };
  
    return (
        <div className="wrapper">
            <Header/>
            <div className="sign-content">
                <SignInForm
                    signIn={signIn}
                    serverErr={err}
                />
            </div>  
            <Footer/>  
        </div>
    )
  }
  
  export default SignInPage; 